using System.Xml.Linq;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs.Dte;
using SgalApp.Api.Security;
using SgalApp.Api.Services.Dte;

namespace SgalApp.Api.Controllers;

/// <summary>
/// Configuración de la emisión de DTE: identidad del emisor, certificado digital, correo y
/// folios (CAF). La API de LibreDTE Core es sin estado, por lo que SGAL-App conserva el
/// certificado (con su clave cifrada) y los CAF, y es la autoridad de asignación de folios. La
/// emisión de documentos por venta se agrega en fases posteriores.
/// </summary>
[ApiController]
[Route("api/dte")]
public sealed class DteController : ControllerBase
{
    private const int EmisorId = 1;
    private const long MaxCertBytes = 1 * 1024 * 1024;
    private const long MaxCafBytes = 1 * 1024 * 1024;

    private readonly SgalContext _context;
    private readonly ILibreDteClient _libreDte;
    private readonly IDteService _dteService;
    private readonly IDataProtector _protector;

    public DteController(SgalContext context, ILibreDteClient libreDte, IDteService dteService, IDataProtectionProvider dataProtection)
    {
        _context = context;
        _libreDte = libreDte;
        _dteService = dteService;
        _protector = dataProtection.CreateProtector("SGAL.Dte.v1");
    }

    [HttpGet("ping")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> Ping(CancellationToken cancellationToken)
    {
        var result = await _libreDte.PingAsync(cancellationToken);
        return result.Ok ? Ok(new { disponible = true }) : StatusCode(503, new { disponible = false, mensaje = result.Error });
    }

    /// <summary>Clientes empresa guardados previamente al emitir facturas.</summary>
    [HttpGet("clientes")]
    [Permission(Permissions.SalesCreate + "|" + Permissions.SalesCreatePoint + "|" + Permissions.CajaCollect)]
    public async Task<IActionResult> Clientes([FromQuery] string? search, CancellationToken cancellationToken)
    {
        var query = _context.SiiClientesEmpresa.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(client => client.RutEmpresa.Contains(term) || client.RazonSocial.Contains(term));
        }

        var clientes = await query
            .OrderBy(client => client.RazonSocial)
            .Take(100)
            .Select(client => new
            {
                client.IdClienteEmpresa,
                Rut = client.RutEmpresa,
                client.RazonSocial,
                client.Giro,
                Direccion = client.DireccionLegal,
                client.Comuna,
                client.Ciudad,
                client.Correo
            })
            .ToListAsync(cancellationToken);
        return Ok(clientes);
    }

    /// <summary>
    /// Emite una boleta de PRUEBA (tipo 39) con certificado y folios ficticios de LibreDTE y
    /// devuelve los datos para imprimir el ticket 80mm con su timbre. Sirve para verificar el
    /// flujo de emisión de punta a punta sin comprar certificado ni tocar el SII.
    /// </summary>
    [HttpPost("emitir-prueba")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> EmitirPrueba(CancellationToken cancellationToken)
    {
        try
        {
            var boleta = await _dteService.EmitirPruebaAsync(cancellationToken);
            return Ok(BoletaResponse(boleta));
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = ex.Message });
        }
    }

    /// <summary>Datos para imprimir el ticket 80mm de una venta ya emitida (folio, montos, TED).</summary>
    [HttpGet("venta/{idVenta:int}/impresion")]
    [Permission(Permissions.CajaCollect + "|" + Permissions.SalesDocumentsReprint + "|" + Permissions.BoletasConfigure)]
    public async Task<IActionResult> ImpresionBoleta(int idVenta, CancellationToken cancellationToken)
    {
        var boleta = await _dteService.ObtenerBoletaAsync(idVenta, cancellationToken);
        if (boleta == null)
            return NotFound(new { mensaje = "La venta no tiene un documento emitido." });
        return Ok(BoletaResponse(boleta));
    }

    [HttpGet("venta/{idVenta:int}/pdf")]
    [Permission(Permissions.CajaCollect + "|" + Permissions.SalesDocumentsReprint + "|" + Permissions.BoletasConfigure)]
    public async Task<IActionResult> DescargarFactura(int idVenta, CancellationToken cancellationToken)
    {
        try
        {
            var pdf = await _dteService.ObtenerFacturaPdfAsync(idVenta, cancellationToken);
            if (pdf is not { Length: > 0 }) return NotFound(new { mensaje = "La venta no tiene una factura emitida." });
            var folio = await _context.SiiDteEmision.AsNoTracking().Where(e => e.IdVenta == idVenta && (e.IdTipoDte == 33 || e.IdTipoDte == 34)).Select(e => e.Folio).FirstOrDefaultAsync(cancellationToken);
            Response.Headers.ContentDisposition = $"inline; filename=\"Factura-{folio}.pdf\"";
            return File(pdf, "application/pdf");
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = ex.Message });
        }
    }

    private static object BoletaResponse(SgalApp.Api.Services.Dte.BoletaEmitida boleta) => new
    {
        boleta.TipoDte,
        boleta.Folio,
        boleta.Fecha,
        Emisor = new
        {
            boleta.Emisor.Rut,
            boleta.Emisor.RazonSocial,
            boleta.Emisor.Giro,
            boleta.Emisor.Direccion,
            boleta.Emisor.Comuna
        },
        Lineas = boleta.Lineas.Select(l => new
        {
            l.Nombre,
            l.Cantidad,
            l.PrecioUnitario,
            Subtotal = l.Cantidad * l.PrecioUnitario
        }),
        Montos = new { boleta.Montos.Neto, boleta.Montos.Exento, boleta.Montos.Iva, boleta.Montos.Total },
        boleta.Ted
    };

    /// <summary>
    /// Emite el documento tributario de una venta ya concretada (decide boleta/factura por el
    /// receptor) y lo persiste. Pensado para pruebas y reemisión manual; el enganche automático
    /// en el flujo de venta se agrega aparte.
    /// </summary>
    [HttpPost("venta/{idVenta:int}/emitir")]
    [Permission(Permissions.BoletasConfigure + "|" + Permissions.CajaCollect)]
    public async Task<IActionResult> EmitirVenta(int idVenta, CancellationToken cancellationToken)
    {
        try
        {
            var resultado = await _dteService.EmitirPorVentaAsync(idVenta, cancellationToken);
            return Ok(new { resultado.TipoDte, resultado.Folio, mensaje = "Documento emitido." });
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = ex.Message });
        }
    }

    [HttpGet("emisor")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> GetEmisor()
    {
        var emisor = await _context.SiiEmisor.AsNoTracking()
            .FirstOrDefaultAsync(e => e.IdEmisor == EmisorId);

        var folios = await _context.SiiCafFolios.AsNoTracking()
            .Select(c => new CafResumenDto
            {
                TipoDte = c.IdTipoDte,
                NombreDte = c.IdTipoDteNavigation.NombreDte,
                FolioDesde = c.FolioDesde,
                FolioHasta = c.FolioHasta,
                UltimoFolioUtilizado = c.UltimoFolioUtilizado,
                Disponibles = c.FolioHasta - c.UltimoFolioUtilizado,
                EsPrueba = c.EsPrueba
            })
            .ToListAsync();

        if (emisor == null)
            return Ok(new EmisorDto { Folios = folios });

        return Ok(new EmisorDto
        {
            Rut = emisor.Rut,
            RazonSocial = emisor.RazonSocial,
            Giro = emisor.Giro,
            Direccion = emisor.Direccion,
            Comuna = emisor.Comuna,
            Ciudad = emisor.Ciudad,
            Acteco = emisor.Acteco,
            ResolucionNumero = emisor.ResolucionNumero,
            ResolucionFecha = emisor.ResolucionFecha,
            Ambiente = emisor.Ambiente,
            Fase = emisor.Fase,
            LibredteUrl = emisor.LibredteUrl,
            CertificadoCargado = emisor.CertificadoPfx != null,
            CertificadoNombre = emisor.CertificadoNombre,
            SmtpHost = emisor.SmtpHost,
            SmtpPuerto = emisor.SmtpPuerto,
            SmtpUsuario = emisor.SmtpUsuario,
            SmtpClaveConfigurada = !string.IsNullOrEmpty(emisor.SmtpClaveProtegida),
            CorreoRemitente = emisor.CorreoRemitente,
            EnvioAutomaticoCorreo = emisor.EnvioAutomaticoCorreo,
            Folios = folios
        });
    }

    [HttpGet("estado-puesta-en-marcha")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> GetEstadoPuestaEnMarcha(CancellationToken cancellationToken)
    {
        var emisor = await _context.SiiEmisor.AsNoTracking()
            .FirstOrDefaultAsync(e => e.IdEmisor == EmisorId, cancellationToken);
        var fase = emisor?.Fase ?? "desarrollo";
        var conexion = await _libreDte.PingAsync(cancellationToken);
        var cafReal = await _context.SiiCafFolios.AsNoTracking()
            .AnyAsync(c => !c.EsPrueba && c.UltimoFolioUtilizado < c.FolioHasta, cancellationToken);
        var locales = await _context.SiiDteEmision.AsNoTracking().CountAsync(e => e.EsPrueba, cancellationToken);
        var estados = await _context.SiiDteEmision.AsNoTracking().Where(e => !e.EsPrueba)
            .GroupBy(e => e.IdEstadoBoletaNavigation.NombreEstadoBoleta)
            .Select(g => new { Estado = g.Key, Cantidad = g.Count() })
            .ToDictionaryAsync(x => x.Estado, x => x.Cantidad, cancellationToken);

        var datosCompletos = emisor != null
            && !string.IsNullOrWhiteSpace(emisor.Rut)
            && !string.IsNullOrWhiteSpace(emisor.RazonSocial)
            && !string.IsNullOrWhiteSpace(emisor.Giro)
            && !string.IsNullOrWhiteSpace(emisor.Direccion)
            && !string.IsNullOrWhiteSpace(emisor.Comuna);
        var resolucion = emisor?.ResolucionNumero != null && emisor.ResolucionFecha != null;
        var certificado = emisor?.CertificadoPfx is { Length: > 0 };

        return Ok(new DteEstadoPuestaEnMarchaDto
        {
            Fase = fase,
            Titulo = fase switch
            {
                "produccion" => "Producción autorizada",
                "certificacion" => "Certificación ante el SII",
                _ => "Desarrollo local"
            },
            Descripcion = fase switch
            {
                "produccion" => "Los documentos se timbran y envían al ambiente productivo del SII.",
                "certificacion" => "Los documentos se envían al ambiente de certificación del SII.",
                _ => "La aplicación usa certificado y CAF ficticios. Los documentos no se envían al SII."
            },
            ConexionLibreDte = conexion.Ok,
            DatosEmisorCompletos = datosCompletos,
            CertificadoRealCargado = certificado,
            CafRealesCargados = cafReal,
            ResolucionConfigurada = resolucion,
            PuedeEnviarAlSii = conexion.Ok && datosCompletos && certificado && cafReal
                && (fase != "produccion" || resolucion),
            LocalesPrueba = locales,
            Pendientes = estados.GetValueOrDefault("Pendiente"),
            Enviados = estados.GetValueOrDefault("Enviado"),
            Aceptados = estados.GetValueOrDefault("Aceptado") + estados.GetValueOrDefault("Aceptado con reparos"),
            Rechazados = estados.GetValueOrDefault("Rechazado")
        });
    }

    [HttpPost("procesar-pendientes")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> ProcesarPendientes(CancellationToken cancellationToken)
    {
        try
        {
            await _dteService.ProcesarPendientesSiiAsync(cancellationToken);
            return Ok(new { mensaje = "Cola SII procesada." });
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = ex.Message });
        }
    }

    [HttpGet("contingencias")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> GetContingencias(CancellationToken cancellationToken)
    {
        var pendientes = await _context.SiiContingenciaDte.AsNoTracking()
            .Where(c => c.Estado == "pendiente")
            .GroupBy(c => c.IdTipoDte)
            .Select(g => new
            {
                tipoDte = g.Key,
                cantidad = g.Count(),
                montoTotal = g.Sum(c => c.IdVentaNavigation.MontoTotal),
                desde = g.Min(c => c.IdVentaNavigation.FechaVenta),
                hasta = g.Max(c => c.IdVentaNavigation.FechaVenta)
            }).ToListAsync(cancellationToken);
        var ultimosLotes = await _context.SiiContingenciaLote.AsNoTracking()
            .OrderByDescending(l => l.FechaEmision).Take(10)
            .Select(l => new { l.IdLote, l.IdTipoDte, l.Folio, l.Estado, l.CantidadVentas, l.MontoTotal, l.Desde, l.Hasta, l.FechaEmision })
            .ToListAsync(cancellationToken);
        return Ok(new { pendientes, ultimosLotes });
    }

    [HttpPost("contingencias/regularizar")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> RegularizarContingencias(CancellationToken cancellationToken)
    {
        try
        {
            var lotes = await _dteService.RegularizarContingenciaAsync(cancellationToken);
            return Ok(new { mensaje = lotes.Count == 0 ? "No hay ventas pendientes." : "Contingencia regularizada.", lotes });
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = ex.Message });
        }
    }

    [HttpPut("emisor")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> UpdateEmisor([FromBody] UpdateEmisorDto dto)
    {
        if (dto.Ambiente is not ("certificacion" or "produccion"))
            return BadRequest(new { mensaje = "El ambiente debe ser 'certificacion' o 'produccion'." });
        if (dto.Fase is not ("desarrollo" or "certificacion" or "produccion"))
            return BadRequest(new { mensaje = "La fase debe ser 'desarrollo', 'certificacion' o 'produccion'." });

        var emisor = await _context.SiiEmisor.FirstOrDefaultAsync(e => e.IdEmisor == EmisorId);
        var esNuevo = emisor == null;
        emisor ??= new SiiEmisor { IdEmisor = EmisorId };

        if (dto.Fase is "certificacion" or "produccion")
        {
            if (emisor.CertificadoPfx is not { Length: > 0 })
                return BadRequest(new { mensaje = "Cargue un certificado digital real antes de cambiar de fase." });
            if (!await _context.SiiCafFolios.AnyAsync(c => !c.EsPrueba && c.UltimoFolioUtilizado < c.FolioHasta))
                return BadRequest(new { mensaje = "Cargue al menos un CAF real con folios disponibles antes de cambiar de fase." });
        }
        if (dto.Fase == "produccion" && (dto.ResolucionNumero == null || dto.ResolucionFecha == null))
            return BadRequest(new { mensaje = "Configure la resolución de autorización del SII antes de pasar a producción." });

        emisor.Rut = dto.Rut.Trim();
        emisor.RazonSocial = dto.RazonSocial.Trim();
        emisor.Giro = dto.Giro.Trim();
        emisor.Direccion = dto.Direccion.Trim();
        emisor.Comuna = dto.Comuna.Trim();
        emisor.Ciudad = dto.Ciudad.Trim();
        emisor.Acteco = dto.Acteco;
        emisor.ResolucionNumero = dto.ResolucionNumero;
        emisor.ResolucionFecha = dto.ResolucionFecha;
        emisor.Ambiente = dto.Fase == "produccion" ? "produccion" : "certificacion";
        emisor.Fase = dto.Fase;
        emisor.LibredteUrl = string.IsNullOrWhiteSpace(dto.LibredteUrl) ? null : dto.LibredteUrl.Trim();
        emisor.SmtpHost = dto.SmtpHost?.Trim();
        emisor.SmtpPuerto = dto.SmtpPuerto;
        emisor.SmtpUsuario = dto.SmtpUsuario?.Trim();
        emisor.CorreoRemitente = dto.CorreoRemitente?.Trim();
        emisor.EnvioAutomaticoCorreo = dto.EnvioAutomaticoCorreo;
        // La clave SMTP solo se reemplaza si viene una nueva; vacío conserva la actual.
        if (!string.IsNullOrEmpty(dto.SmtpClave))
            emisor.SmtpClaveProtegida = _protector.Protect(dto.SmtpClave);
        emisor.FechaActualizacion = DateTime.UtcNow;

        if (esNuevo) _context.SiiEmisor.Add(emisor);
        await _context.SaveChangesAsync();

        return Ok(new { mensaje = "Configuración del emisor guardada." });
    }

    [HttpPost("certificado")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> SubirCertificado([FromForm] IFormFile certificado, [FromForm] string clave, CancellationToken cancellationToken)
    {
        if (certificado == null || certificado.Length == 0)
            return BadRequest(new { mensaje = "Debe adjuntar el archivo del certificado." });
        if (certificado.Length > MaxCertBytes)
            return BadRequest(new { mensaje = "El certificado supera el tamaño máximo permitido." });
        if (string.IsNullOrWhiteSpace(clave))
            return BadRequest(new { mensaje = "Debe indicar la clave del certificado." });

        var emisor = await _context.SiiEmisor.FirstOrDefaultAsync(e => e.IdEmisor == EmisorId, cancellationToken);
        if (emisor == null)
            return BadRequest(new { mensaje = "Configure primero los datos del emisor." });

        using var ms = new MemoryStream();
        await certificado.CopyToAsync(ms, cancellationToken);

        try
        {
            await _libreDte.CargarCertificadoAsync(ms.ToArray(), clave, cancellationToken);
        }
        catch (DteException ex)
        {
            return BadRequest(new { mensaje = $"El certificado o su clave no son válidos: {ex.Message}" });
        }

        emisor.CertificadoPfx = ms.ToArray();
        emisor.CertificadoClaveProtegida = _protector.Protect(clave);
        emisor.CertificadoNombre = Path.GetFileName(certificado.FileName);
        emisor.FechaActualizacion = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new { mensaje = "Certificado guardado.", certificadoNombre = emisor.CertificadoNombre });
    }

    /// <summary>
    /// Registra un CAF: guarda su XML y su rango de folios. LibreDTE Core no almacena folios, por
    /// lo que SGAL-App es la autoridad: el XML se enviará al emitir y el rango sirve de monitoreo.
    /// </summary>
    [HttpPost("caf")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> RegistrarCaf([FromForm] IFormFile caf, CancellationToken cancellationToken)
    {
        if (caf == null || caf.Length == 0)
            return BadRequest(new { mensaje = "Debe adjuntar el archivo CAF." });
        if (caf.Length > MaxCafBytes)
            return BadRequest(new { mensaje = "El archivo CAF supera el tamaño máximo permitido." });

        using var ms = new MemoryStream();
        await caf.CopyToAsync(ms, cancellationToken);
        var bytes = ms.ToArray();

        CafInfo info;
        try
        {
            info = ParseCaf(bytes);
        }
        catch (Exception)
        {
            return BadRequest(new { mensaje = "El archivo CAF no tiene el formato esperado." });
        }

        if (!await _context.SiiTiposDte.AnyAsync(t => t.IdTipoDte == info.TipoDte, cancellationToken))
            return BadRequest(new { mensaje = $"El CAF es de un tipo de documento no soportado ({info.TipoDte})." });

        var existente = await _context.SiiCafFolios
            .FirstOrDefaultAsync(c => c.IdTipoDte == info.TipoDte
                && c.FolioDesde == info.FolioDesde && c.FolioHasta == info.FolioHasta, cancellationToken);

        if (existente == null)
        {
            _context.SiiCafFolios.Add(new SiiCafFolios
            {
                IdTipoDte = info.TipoDte,
                FolioDesde = info.FolioDesde,
                FolioHasta = info.FolioHasta,
                UltimoFolioUtilizado = info.FolioDesde - 1,
                ArchivoXmlCaf = bytes,
                EsPrueba = false
            });
        }
        else
        {
            existente.ArchivoXmlCaf = bytes;
            existente.EsPrueba = false;
        }

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            mensaje = "CAF registrado.",
            tipoDte = info.TipoDte,
            folioDesde = info.FolioDesde,
            folioHasta = info.FolioHasta
        });
    }

    /// <summary>Extrae tipo y rango de folios del XML del CAF (nodo DA/TD y DA/RNG/D-H).</summary>
    private static CafInfo ParseCaf(byte[] xml)
    {
        var doc = XDocument.Load(new MemoryStream(xml));
        var da = doc.Descendants("DA").First();
        return new CafInfo
        {
            TipoDte = int.Parse(da.Element("TD")!.Value),
            FolioDesde = int.Parse(da.Element("RNG")!.Element("D")!.Value),
            FolioHasta = int.Parse(da.Element("RNG")!.Element("H")!.Value)
        };
    }
}
