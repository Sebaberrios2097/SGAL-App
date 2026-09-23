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

    /// <summary>
    /// Emite una boleta de PRUEBA (tipo 39) con certificado y folios ficticios de LibreDTE y
    /// devuelve el PDF. Sirve para verificar la conexión y el flujo de emisión de punta a punta
    /// sin comprar certificado ni tocar el SII.
    /// </summary>
    [HttpPost("emitir-prueba")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> EmitirPrueba(CancellationToken cancellationToken)
    {
        try
        {
            var resultado = await _dteService.EmitirPruebaAsync(cancellationToken);
            return File(resultado.Pdf, "application/pdf", $"boleta-prueba-{resultado.Folio}.pdf");
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
                Disponibles = c.FolioHasta - c.UltimoFolioUtilizado
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

    [HttpPut("emisor")]
    [Permission(Permissions.BoletasConfigure)]
    public async Task<IActionResult> UpdateEmisor([FromBody] UpdateEmisorDto dto)
    {
        if (dto.Ambiente is not ("certificacion" or "produccion"))
            return BadRequest(new { mensaje = "El ambiente debe ser 'certificacion' o 'produccion'." });

        var emisor = await _context.SiiEmisor.FirstOrDefaultAsync(e => e.IdEmisor == EmisorId);
        var esNuevo = emisor == null;
        emisor ??= new SiiEmisor { IdEmisor = EmisorId };

        emisor.Rut = dto.Rut.Trim();
        emisor.RazonSocial = dto.RazonSocial.Trim();
        emisor.Giro = dto.Giro.Trim();
        emisor.Direccion = dto.Direccion.Trim();
        emisor.Comuna = dto.Comuna.Trim();
        emisor.Ciudad = dto.Ciudad.Trim();
        emisor.Acteco = dto.Acteco;
        emisor.ResolucionNumero = dto.ResolucionNumero;
        emisor.ResolucionFecha = dto.ResolucionFecha;
        emisor.Ambiente = dto.Ambiente;
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
                ArchivoXmlCaf = bytes
            });
        }
        else
        {
            existente.ArchivoXmlCaf = bytes;
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
