using System.Text;
using System.Text.RegularExpressions;
using System.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Services.Dte;

/// <summary>
/// Orquesta la emisión de documentos tributarios contra LibreDTE Core: arma el Encabezado y el
/// Detalle, construye (firma y timbra), renderiza la factura y persiste el resultado. Usa el
/// certificado y los CAF reales de <c>SII_Emisor</c>/<c>SII_Caf_Folios</c> cuando están
/// configurados; si no, cae a los generadores ficticios de LibreDTE para poder emitir en
/// desarrollo sin comprar certificado.
/// </summary>
public interface IDteService
{
    /// <summary>Emite una boleta de prueba (tipo 39) y devuelve los datos para imprimir el ticket 80mm.</summary>
    Task<BoletaEmitida> EmitirPruebaAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Emite el documento tributario de una venta ya concretada: decide el tipo (39/41/33/34),
    /// firma/timbra, y persiste en SII_Dte_Emision (folio, XML, montos). Es idempotente por venta
    /// y tipo. Debe llamarse DESPUÉS del commit de la venta.
    /// </summary>
    Task<DteEmisionResultado> EmitirPorVentaAsync(int idVenta, CancellationToken cancellationToken = default);

    /// <summary>
    /// Datos para imprimir el ticket 80mm de una venta ya emitida (folio, montos, líneas y TED).
    /// Devuelve null si la venta no tiene un documento emitido.
    /// </summary>
    Task<BoletaEmitida?> ObtenerBoletaAsync(int idVenta, CancellationToken cancellationToken = default);

    /// <summary>
    /// Emite una nota de crédito (61) que anula el documento original de la venta, referenciándolo.
    /// Idempotente: si ya existe una NC para la venta, la devuelve.
    /// </summary>
    Task<DteEmisionResultado> EmitirNotaCreditoAsync(int idVenta, CancellationToken cancellationToken = default);

    /// <summary>Reintenta envíos pendientes y actualiza estados de Track ID ante el SII.</summary>
    Task ProcesarPendientesSiiAsync(CancellationToken cancellationToken = default);

    /// <summary>Emite una boleta resumen por tipo y vincula todas las ventas pendientes.</summary>
    Task<IReadOnlyList<DteContingenciaResultado>> RegularizarContingenciaAsync(CancellationToken cancellationToken = default);

    /// <summary>Genera nuevamente la representación PDF desde el XML y los datos actuales.</summary>
    Task<byte[]?> ObtenerFacturaPdfAsync(int idVenta, CancellationToken cancellationToken = default);
}

public sealed class DteService : IDteService
{
    private const int EmisorId = 1;
    private readonly SgalContext _context;
    private readonly ILibreDteClient _client;
    private readonly IDataProtector _protector;
    private readonly ILogger<DteService> _logger;
    private readonly IFacturaPdfService _facturaPdf;

    public DteService(SgalContext context, ILibreDteClient client, IDataProtectionProvider dataProtection, ILogger<DteService> logger, IFacturaPdfService facturaPdf)
    {
        _context = context;
        _client = client;
        _protector = dataProtection.CreateProtector("SGAL.Dte.v1");
        _logger = logger;
        _facturaPdf = facturaPdf;
    }

    public async Task<BoletaEmitida> EmitirPruebaAsync(CancellationToken cancellationToken = default)
    {
        const int tipoDte = 39;
        const int folio = 1;

        var (emisorEntity, emisor) = await ResolverEmisorAsync(cancellationToken);
        var receptor = DteReceptorData.ConsumidorFinal();
        var lineas = new (string Nombre, int Cantidad, int Precio, bool Exento)[]
        {
            ("Cafe Latte", 1, 2500, false),
            ("Sandwich Ave Palta", 1, 4500, false)
        };

        var certificado = await ResolverCertificadoAsync(emisorEntity, cancellationToken);
        var cafBase64 = await _client.CrearCafFalsoAsync(emisor.Rut, emisor.RazonSocial, tipoDte, 1, 100, cancellationToken);

        var parsedData = ConstruirParsedData(tipoDte, folio, emisor, receptor, BuildDetalle(lineas));
        var build = await _client.ConstruirAsync(parsedData, cafBase64, certificado, cancellationToken);

        int total = lineas.Sum(l => l.Cantidad * l.Precio);
        return new BoletaEmitida
        {
            TipoDte = tipoDte,
            Folio = folio,
            Fecha = DateTime.Now,
            Emisor = emisor,
            Lineas = lineas.Select(l => new DteLinea(l.Nombre, l.Cantidad, l.Precio)).ToList(),
            Montos = DteMontosCalculator.Calcular(total, esExento: false),
            Ted = ExtraerTed(build.DocumentXml)
        };
    }

    public async Task<DteEmisionResultado> EmitirPorVentaAsync(int idVenta, CancellationToken cancellationToken = default)
    {
        var venta = await _context.VenVentas
            .Include(v => v.VenDetalleVenta).ThenInclude(d => d.IdProductoNavigation)
            .Include(v => v.IdClienteEmpresaNavigation)
            .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);

        if (venta == null)
            throw new DteException($"La venta {idVenta} no existe.");
        if (venta.VenDetalleVenta.Count == 0)
            throw new DteException("La venta no tiene líneas para emitir.");

        var lineas = venta.VenDetalleVenta.Select(d => (
            Nombre: d.IdProductoNavigation.NombreProducto,
            Cantidad: d.Cantidad,
            Precio: d.PrecioUnitario,
            Exento: d.IndExento ?? false)).ToArray();

        bool tieneRut = venta.IdClienteEmpresa != null;
        bool todoExento = lineas.All(l => l.Exento);
        int tipoDte = tieneRut ? (todoExento ? 34 : 33) : (todoExento ? 41 : 39);

        // Idempotencia: no re-emitir el mismo tipo para la misma venta.
        var yaEmitido = await _context.SiiDteEmision
            .FirstOrDefaultAsync(e => e.IdVenta == idVenta && e.IdTipoDte == tipoDte, cancellationToken);
        if (yaEmitido != null)
            return new DteEmisionResultado { TipoDte = tipoDte, Folio = yaEmitido.Folio ?? 0, DocumentXml = string.Empty };

        var (emisorEntity, emisor) = await ResolverEmisorAsync(cancellationToken);
        var receptor = tieneRut ? MapReceptor(venta.IdClienteEmpresaNavigation!) : DteReceptorData.ConsumidorFinal();

        var certificado = await ResolverCertificadoAsync(emisorEntity, cancellationToken);
        (string cafBase64, int folio, SiiCafFolios cafRow) reserva;
        try
        {
            reserva = await ResolverCafFolioAsync(tipoDte, emisor, cancellationToken);
        }
        catch (DteSinFoliosException) when (tipoDte is 39 or 41 && emisorEntity?.Fase == "produccion")
        {
            await RegistrarContingenciaAsync(venta, tipoDte, "Sin CAF con folios disponibles", cancellationToken);
            throw new DteException("La venta quedó registrada en contingencia porque no hay folios disponibles. El comprobante interno no es una boleta tributaria.");
        }
        var (cafBase64, folio, _) = reserva;

        // Reconcilia el documento con lo realmente cobrado (VenVentas.MontoTotal): las líneas van a
        // precio lleno, pero el total baja por descuento global, promociones y cortesía, y sube por
        // el recargo de envases. El delta se declara como DscRcgGlobal para que MntTotal cuadre.
        int ajusteGlobal = venta.MontoTotal > 0 ? lineas.Sum(l => l.Cantidad * l.Precio) - venta.MontoTotal : 0;
        var parsedData = ConstruirParsedData(tipoDte, folio, emisor, receptor, BuildDetalle(lineas),
            ajusteGlobal: ajusteGlobal, ajusteSobreExento: todoExento);
        var build = await _client.ConstruirAsync(parsedData, cafBase64, certificado, cancellationToken);

        var montos = ExtraerTotales(build.DocumentXml);
        var xmlBytes = Convert.FromBase64String(build.DocumentXml);

        // La factura se imprime como PDF carta; la boleta la imprime SGAL en 80mm (no se guarda PDF).
        byte[]? pdf = null;
        if (tipoDte is 33 or 34)
        {
            try
            {
                pdf = await _facturaPdf.CrearAsync(venta, emisor, receptor, tipoDte, folio, montos, ExtraerTed(build.DocumentXml), cancellationToken);
            }
            catch (Exception ex)
            {
                // El PDF es una representación: una falla visual no debe perder el XML firmado,
                // el folio ni impedir su envío. Se regenerará al descargar/reimprimir.
                _logger.LogError(ex, "No se pudo generar el PDF de la factura {TipoDte} folio {Folio}; el DTE continuará y el PDF se regenerará después.", tipoDte, folio);
            }
        }

        // Según la fase: local (desarrollo) o envío al SII (certificación/producción).
        var (estadoId, trackId) = await ResolverEnvioSiiAsync(emisorEntity, emisor, build.DocumentXml, certificado, cancellationToken);

        var emision = new SiiDteEmision
        {
            IdVenta = idVenta,
            IdTipoDte = tipoDte,
            IdEstadoBoleta = estadoId,
            Folio = folio,
            TrackId = trackId,
            MontoNeto = montos.Neto,
            MontoExento = montos.Exento,
            MontoIva = montos.Iva,
            MontoTotal = montos.Total,
            XmlFirmado = xmlBytes,
            Pdf = pdf,
            FechaEmision = DateTime.Now,
            FechaActualizacion = DateTime.Now,
            EsPrueba = emisorEntity?.Fase is not ("certificacion" or "produccion")
        };
        _context.SiiDteEmision.Add(emision);

        venta.IdTipoDte = tipoDte;
        venta.FolioDte = folio;
        venta.IdEstadoBoleta = estadoId;
        venta.MontoNeto = montos.Neto;
        venta.MontoIva = montos.Iva;

        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Venta {IdVenta} emitida como DTE {Tipo} folio {Folio}.", idVenta, tipoDte, folio);

        return new DteEmisionResultado
        {
            TipoDte = tipoDte,
            Folio = folio,
            Pdf = pdf ?? [],
            DocumentXml = build.DocumentXml
        };
    }

    public async Task<DteEmisionResultado> EmitirNotaCreditoAsync(int idVenta, CancellationToken cancellationToken = default)
    {
        var venta = await _context.VenVentas
            .Include(v => v.VenDetalleVenta).ThenInclude(d => d.IdProductoNavigation)
            .Include(v => v.IdClienteEmpresaNavigation)
            .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);
        if (venta == null)
            throw new DteException($"La venta {idVenta} no existe.");
        if (venta.IdTipoDte == null || venta.FolioDte == null)
            throw new DteException("La venta no tiene un documento emitido que anular.");

        var original = await _context.SiiDteEmision
            .FirstOrDefaultAsync(e => e.IdVenta == idVenta && e.IdTipoDte == venta.IdTipoDte, cancellationToken);
        if (original == null)
            throw new DteException("No se encontró el documento original para la nota de crédito.");

        const int tipoNc = 61;
        var yaNc = await _context.SiiDteEmision
            .FirstOrDefaultAsync(e => e.IdVenta == idVenta && e.IdTipoDte == tipoNc, cancellationToken);
        if (yaNc != null)
            return new DteEmisionResultado { TipoDte = tipoNc, Folio = yaNc.Folio ?? 0, DocumentXml = string.Empty };

        var (emisorEntity, emisor) = await ResolverEmisorAsync(cancellationToken);
        bool tieneRut = venta.IdClienteEmpresa != null;
        var receptor = tieneRut ? MapReceptor(venta.IdClienteEmpresaNavigation!) : DteReceptorData.ConsumidorFinal();
        var lineas = venta.VenDetalleVenta.Select(d => (
            Nombre: d.IdProductoNavigation.NombreProducto,
            Cantidad: d.Cantidad,
            Precio: d.PrecioUnitario,
            Exento: d.IndExento ?? false)).ToArray();

        var certificado = await ResolverCertificadoAsync(emisorEntity, cancellationToken);
        var (cafBase64, folio, _) = await ResolverCafFolioAsync(tipoNc, emisor, cancellationToken);

        // Referencia al documento anulado (CodRef = 1: anula el documento).
        var referencias = new object[]
        {
            new
            {
                NroLinRef = 1,
                TpoDocRef = venta.IdTipoDte.Value,
                FolioRef = venta.FolioDte.Value,
                FchRef = (original.FechaEmision ?? venta.FechaVenta).ToString("yyyy-MM-dd"),
                CodRef = 1,
                RazonRef = "Anula documento"
            }
        };

        // La NC anula el mismo monto que el documento original: se reconcilia igual contra MontoTotal.
        int ajusteGlobal = venta.MontoTotal > 0 ? lineas.Sum(l => l.Cantidad * l.Precio) - venta.MontoTotal : 0;
        bool todoExentoNc = lineas.All(l => l.Exento);
        var parsedData = ConstruirParsedData(tipoNc, folio, emisor, receptor, BuildDetalle(lineas), referencias,
            ajusteGlobal: ajusteGlobal, ajusteSobreExento: todoExentoNc);
        var build = await _client.ConstruirAsync(parsedData, cafBase64, certificado, cancellationToken);
        var montos = ExtraerTotales(build.DocumentXml);
        var (estadoId, trackId) = await ResolverEnvioSiiAsync(emisorEntity, emisor, build.DocumentXml, certificado, cancellationToken);

        _context.SiiDteEmision.Add(new SiiDteEmision
        {
            IdVenta = idVenta,
            IdTipoDte = tipoNc,
            IdEstadoBoleta = estadoId,
            Folio = folio,
            TrackId = trackId,
            MontoNeto = montos.Neto,
            MontoExento = montos.Exento,
            MontoIva = montos.Iva,
            MontoTotal = montos.Total,
            XmlFirmado = Convert.FromBase64String(build.DocumentXml),
            FechaEmision = DateTime.Now,
            FechaActualizacion = DateTime.Now,
            IdEmisionReferencia = original.IdEmision,
            EsPrueba = emisorEntity?.Fase is not ("certificacion" or "produccion")
        });
        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Nota de crédito folio {Folio} emitida para venta {IdVenta} (anula {Tipo} folio {FolioOrig}).",
            folio, idVenta, venta.IdTipoDte, venta.FolioDte);

        return new DteEmisionResultado { TipoDte = tipoNc, Folio = folio, DocumentXml = build.DocumentXml };
    }

    public async Task<BoletaEmitida?> ObtenerBoletaAsync(int idVenta, CancellationToken cancellationToken = default)
    {
        var venta = await _context.VenVentas.AsNoTracking()
            .Include(v => v.VenDetalleVenta).ThenInclude(d => d.IdProductoNavigation)
            .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);
        if (venta?.IdTipoDte == null)
            return null;

        var emision = await _context.SiiDteEmision.AsNoTracking()
            .Where(e => e.IdVenta == idVenta && e.IdTipoDte == venta.IdTipoDte)
            .OrderByDescending(e => e.IdEmision)
            .FirstOrDefaultAsync(cancellationToken);
        if (emision?.XmlFirmado == null)
            return null;

        var (_, emisor) = await ResolverEmisorAsync(cancellationToken);
        return new BoletaEmitida
        {
            TipoDte = emision.IdTipoDte,
            Folio = emision.Folio ?? 0,
            Fecha = emision.FechaEmision ?? venta.FechaVenta,
            Emisor = emisor,
            Lineas = venta.VenDetalleVenta
                .Select(d => new DteLinea(d.IdProductoNavigation.NombreProducto, d.Cantidad, d.PrecioUnitario)).ToList(),
            Montos = new DteMontos(emision.MontoNeto, emision.MontoExento, emision.MontoIva, emision.MontoTotal),
            Ted = ExtraerTedDeXml(Encoding.Latin1.GetString(emision.XmlFirmado))
        };
    }

    public async Task<byte[]?> ObtenerFacturaPdfAsync(int idVenta, CancellationToken cancellationToken = default)
    {
        var venta = await _context.VenVentas
            .Include(v => v.VenDetalleVenta).ThenInclude(d => d.IdProductoNavigation)
            .Include(v => v.IdClienteEmpresaNavigation)
            .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);
        if (venta?.IdTipoDte is not (33 or 34) || venta.IdClienteEmpresaNavigation == null)
            return null;
        var emision = await _context.SiiDteEmision.FirstOrDefaultAsync(e => e.IdVenta == idVenta && e.IdTipoDte == venta.IdTipoDte, cancellationToken);
        if (emision?.XmlFirmado == null) return null;
        var (_, emisor) = await ResolverEmisorAsync(cancellationToken);
        var receptor = MapReceptor(venta.IdClienteEmpresaNavigation);
        var montos = new DteMontos(emision.MontoNeto, emision.MontoExento, emision.MontoIva, emision.MontoTotal);
        var xml = Encoding.Latin1.GetString(emision.XmlFirmado);
        byte[] pdf;
        try
        {
            pdf = await _facturaPdf.CrearAsync(venta, emisor, receptor, emision.IdTipoDte, emision.Folio ?? 0, montos, ExtraerTedDeXml(xml), cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo regenerar el PDF de la factura de la venta {IdVenta}.", idVenta);
            throw new DteException($"No fue posible generar la representación PDF de la factura: {ex.Message}");
        }
        emision.Pdf = pdf;
        emision.FechaActualizacion = DateTime.Now;
        await _context.SaveChangesAsync(cancellationToken);
        return pdf;
    }

    // ---- Resolución de emisor / certificado / CAF ----

    private async Task<(SiiEmisor? Entity, DteEmisorData Data)> ResolverEmisorAsync(CancellationToken cancellationToken)
    {
        var e = await _context.SiiEmisor.AsNoTracking().FirstOrDefaultAsync(x => x.IdEmisor == EmisorId, cancellationToken);
        if (e != null && !string.IsNullOrWhiteSpace(e.Rut))
            return (e, new DteEmisorData(e.Rut, e.RazonSocial, e.Giro, e.Direccion, e.Comuna,
                e.Ciudad, e.ResolucionNumero, e.ResolucionFecha));

        return (e, new DteEmisorData(
            "76192083-9", "CAFE AROMA SpA", "Cafeteria y venta de alimentos",
            "Av. Providencia 1234", "Providencia"));
    }

    private async Task<DteCertificado> ResolverCertificadoAsync(SiiEmisor? emisor, CancellationToken cancellationToken)
    {
        if (emisor?.CertificadoPfx is { Length: > 0 } pfx && !string.IsNullOrEmpty(emisor.CertificadoClaveProtegida))
        {
            var clave = _protector.Unprotect(emisor.CertificadoClaveProtegida);
            return await _client.CargarCertificadoAsync(pfx, clave, cancellationToken);
        }
        if (emisor?.Fase is "certificacion" or "produccion")
            throw new DteException("La fase actual requiere cargar un certificado digital real.");

        // Sin certificado real configurado: se usa uno ficticio únicamente en desarrollo.
        return await _client.CrearCertificadoFalsoAsync("11111111-1", "SGAL Prueba", "prueba@sgal.cl", cancellationToken);
    }

    private async Task<(string CafBase64, int Folio, SiiCafFolios CafRow)> ResolverCafFolioAsync(
        int tipoDte, DteEmisorData emisor, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var fase = (await _context.SiiEmisor.AsNoTracking()
            .Where(e => e.IdEmisor == EmisorId).Select(e => e.Fase)
            .FirstOrDefaultAsync(cancellationToken)) ?? "desarrollo";
        var requiereReal = fase is "certificacion" or "produccion";

        var caf = await _context.SiiCafFolios
            .Where(c => c.IdTipoDte == tipoDte && c.EsPrueba == !requiereReal
                && c.UltimoFolioUtilizado < c.FolioHasta)
            .OrderBy(c => c.IdCaf)
            .FirstOrDefaultAsync(cancellationToken);

        if (caf == null && requiereReal)
            throw new DteSinFoliosException(tipoDte);

        if (caf == null)
        {
            // No hay folios reales disponibles: en desarrollo se genera un CAF ficticio persistente.
            var fakerBase64 = await _client.CrearCafFalsoAsync(emisor.Rut, emisor.RazonSocial, tipoDte, 1, 1000, cancellationToken);
            caf = new SiiCafFolios
            {
                IdTipoDte = tipoDte,
                FolioDesde = 1,
                FolioHasta = 1000,
                UltimoFolioUtilizado = 0,
                ArchivoXmlCaf = Convert.FromBase64String(fakerBase64),
                EsPrueba = true
            };
            _context.SiiCafFolios.Add(caf);
            await _context.SaveChangesAsync(cancellationToken);
        }

        int folio = caf.UltimoFolioUtilizado + 1;
        caf.UltimoFolioUtilizado = folio;
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (Convert.ToBase64String(caf.ArchivoXmlCaf), folio, caf);
    }

    /// <summary>
    /// Decide qué hacer con el documento según la fase del emisor:
    ///   - "desarrollo": no se envía al SII (timbre local) → estado "Aceptado".
    ///   - "certificacion"/"produccion": se envía al SII → estado "Enviado" + Track ID; si el envío
    ///     falla, queda "Pendiente" para reintentar.
    /// </summary>
    private async Task<(int EstadoId, long? TrackId)> ResolverEnvioSiiAsync(
        SiiEmisor? emisorEntity, DteEmisorData emisor, string documentXmlBase64, DteCertificado certificado, CancellationToken cancellationToken)
    {
        var fase = emisorEntity?.Fase ?? "desarrollo";
        if (fase != "certificacion" && fase != "produccion")
            return (await ResolverEstadoIdAsync("Aceptado", cancellationToken), null);

        try
        {
            var trackId = await _client.EnviarAlSiiAsync(
                documentXmlBase64, certificado, emisor.Rut, emisor.RazonSocial,
                emisorEntity?.ResolucionNumero, emisorEntity?.ResolucionFecha,
                fase == "produccion" ? 1 : 0, cancellationToken);
            var estado = trackId.HasValue ? "Enviado" : "Pendiente";
            return (await ResolverEstadoIdAsync(estado, cancellationToken), trackId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo enviar el DTE al SII; queda pendiente de reintento.");
            return (await ResolverEstadoIdAsync("Pendiente", cancellationToken), null);
        }
    }

    public async Task ProcesarPendientesSiiAsync(CancellationToken cancellationToken = default)
    {
        var emisorEntity = await _context.SiiEmisor
            .FirstOrDefaultAsync(e => e.IdEmisor == EmisorId, cancellationToken);
        if (emisorEntity?.Fase is not ("certificacion" or "produccion"))
            return;

        var (_, emisor) = await ResolverEmisorAsync(cancellationToken);
        var certificado = await ResolverCertificadoAsync(emisorEntity, cancellationToken);
        var ambiente = emisorEntity.Fase == "produccion" ? 1 : 0;
        var pendienteId = await ResolverEstadoIdAsync("Pendiente", cancellationToken);
        var enviadoId = await ResolverEstadoIdAsync("Enviado", cancellationToken);

        var emisiones = await _context.SiiDteEmision
            .Include(e => e.IdVentaNavigation)
            .Where(e => (e.IdEstadoBoleta == pendienteId || e.IdEstadoBoleta == enviadoId)
                && !e.EsPrueba && e.XmlFirmado != null && e.Reintentos < 20)
            .OrderBy(e => e.FechaActualizacion)
            .Take(25)
            .ToListAsync(cancellationToken);

        foreach (var emision in emisiones)
        {
            try
            {
                if (!emision.TrackId.HasValue)
                {
                    emision.TrackId = await _client.EnviarAlSiiAsync(
                        Convert.ToBase64String(emision.XmlFirmado!), certificado,
                        emisor.Rut, emisor.RazonSocial, emisorEntity.ResolucionNumero,
                        emisorEntity.ResolucionFecha, ambiente, cancellationToken);
                    emision.IdEstadoBoleta = emision.TrackId.HasValue ? enviadoId : pendienteId;
                }
                else
                {
                    var estado = await _client.ConsultarEstadoSiiAsync(
                        emision.TrackId.Value, certificado, emisor.Rut, ambiente, cancellationToken);
                    emision.IdEstadoBoleta = await ResolverEstadoIdAsync(estado.Estado, cancellationToken);
                    emision.UltimoError = estado.Estado == "Rechazado" ? estado.RespuestaJson : null;
                }

                emision.Reintentos++;
                emision.FechaActualizacion = DateTime.Now;
                if (emision.IdTipoDte != 61)
                    emision.IdVentaNavigation.IdEstadoBoleta = emision.IdEstadoBoleta;
            }
            catch (Exception ex)
            {
                emision.Reintentos++;
                emision.UltimoError = ex.Message;
                emision.FechaActualizacion = DateTime.Now;
                _logger.LogWarning(ex, "Falló el procesamiento SII de la emisión {IdEmision}.", emision.IdEmision);
            }
        }


        var lotesContingencia = await _context.SiiContingenciaLote
            .Where(l => l.Estado == "pendiente_envio" || l.Estado == "enviado")
            .OrderBy(l => l.FechaEmision).Take(10).ToListAsync(cancellationToken);
        foreach (var lote in lotesContingencia)
        {
            try
            {
                if (!lote.TrackId.HasValue)
                {
                    lote.TrackId = await _client.EnviarAlSiiAsync(Convert.ToBase64String(lote.XmlFirmado), certificado,
                        emisor.Rut, emisor.RazonSocial, emisorEntity.ResolucionNumero,
                        emisorEntity.ResolucionFecha, ambiente, cancellationToken);
                    lote.Estado = lote.TrackId.HasValue ? "enviado" : "pendiente_envio";
                }
                else
                {
                    var consulta = await _client.ConsultarEstadoSiiAsync(lote.TrackId.Value, certificado, emisor.Rut, ambiente, cancellationToken);
                    lote.Estado = consulta.Estado switch
                    {
                        "Aceptado" => "aceptado",
                        "Aceptado con reparos" => "aceptado_reparos",
                        "Rechazado" => "rechazado",
                        _ => "enviado"
                    };
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Falló el procesamiento del lote de contingencia {IdLote}.", lote.IdLote);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    private async Task RegistrarContingenciaAsync(VenVentas venta, int tipoDte, string motivo, CancellationToken cancellationToken)
    {
        if (await _context.SiiContingenciaDte.AnyAsync(c => c.IdVenta == venta.IdVenta, cancellationToken))
            return;

        _context.SiiContingenciaDte.Add(new SiiContingenciaDte
        {
            IdVenta = venta.IdVenta,
            IdTipoDte = tipoDte,
            Estado = "pendiente",
            Motivo = motivo,
            FechaRegistro = DateTime.UtcNow
        });
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DteContingenciaResultado>> RegularizarContingenciaAsync(CancellationToken cancellationToken = default)
    {
        var emisorEntity = await _context.SiiEmisor.FirstOrDefaultAsync(e => e.IdEmisor == EmisorId, cancellationToken);
        if (emisorEntity?.Fase != "produccion")
            throw new DteException("La regularización de contingencias solo está disponible en producción.");

        var pendientes = await _context.SiiContingenciaDte
            .Include(c => c.IdVentaNavigation)
            .Where(c => c.Estado == "pendiente" && (c.IdTipoDte == 39 || c.IdTipoDte == 41))
            .OrderBy(c => c.FechaRegistro)
            .ToListAsync(cancellationToken);
        if (pendientes.Count == 0)
            return [];

        var (_, emisor) = await ResolverEmisorAsync(cancellationToken);
        var certificado = await ResolverCertificadoAsync(emisorEntity, cancellationToken);
        var resultados = new List<DteContingenciaResultado>();

        foreach (var grupo in pendientes.GroupBy(c => c.IdTipoDte))
        {
            var ventas = grupo.ToList();
            var total = ventas.Sum(c => c.IdVentaNavigation.MontoTotal);
            var desde = ventas.Min(c => c.IdVentaNavigation.FechaVenta);
            var hasta = ventas.Max(c => c.IdVentaNavigation.FechaVenta);
            var (cafBase64, folio, _) = await ResolverCafFolioAsync(grupo.Key, emisor, cancellationToken);
            var detalle = BuildDetalle([(Nombre: $"Ventas en contingencia {desde:dd-MM-yyyy} a {hasta:dd-MM-yyyy}", Cantidad: 1, Precio: total, Exento: grupo.Key == 41)]);
            var parsedData = ConstruirParsedData(grupo.Key, folio, emisor, DteReceptorData.ConsumidorFinal(), detalle);
            var build = await _client.ConstruirAsync(parsedData, cafBase64, certificado, cancellationToken);
            var (_, trackId) = await ResolverEnvioSiiAsync(emisorEntity, emisor, build.DocumentXml, certificado, cancellationToken);

            var lote = new SiiContingenciaLote
            {
                IdTipoDte = grupo.Key,
                Folio = folio,
                TrackId = trackId,
                Estado = trackId.HasValue ? "enviado" : "pendiente_envio",
                CantidadVentas = ventas.Count,
                MontoTotal = total,
                Desde = desde,
                Hasta = hasta,
                FechaEmision = DateTime.UtcNow,
                XmlFirmado = Convert.FromBase64String(build.DocumentXml)
            };
            _context.SiiContingenciaLote.Add(lote);
            foreach (var item in ventas)
            {
                item.Estado = "regularizada";
                item.FechaRegularizacion = DateTime.UtcNow;
                item.IdLoteNavigation = lote;
            }
            await _context.SaveChangesAsync(cancellationToken);
            resultados.Add(new DteContingenciaResultado(grupo.Key, folio, ventas.Count, total, trackId));
        }
        return resultados;
    }

    private async Task<int> ResolverEstadoIdAsync(string nombre, CancellationToken cancellationToken)
    {
        var estado = await _context.SiiEstadosBoleta.AsNoTracking()
            .FirstOrDefaultAsync(e => e.NombreEstadoBoleta == nombre, cancellationToken);
        return estado?.IdEstadoBoleta
            ?? await _context.SiiEstadosBoleta.AsNoTracking().Select(e => e.IdEstadoBoleta).FirstAsync(cancellationToken);
    }

    private static DteReceptorData MapReceptor(SiiClientesEmpresa c) =>
        new(c.RutEmpresa, c.RazonSocial, c.DireccionLegal, c.Comuna, c.Giro, c.Ciudad, c.Correo);

    // ---- Armado del documento ----

    /// <summary>Convierte las líneas de la venta en el arreglo Detalle del DTE (marca IndExe).</summary>
    private static object[] BuildDetalle(IEnumerable<(string Nombre, int Cantidad, int Precio, bool Exento)> lineas) =>
        lineas.Select(l => (object)(l.Exento
            ? new { NmbItem = l.Nombre, QtyItem = l.Cantidad, PrcItem = l.Precio, IndExe = 1 }
            : new { NmbItem = l.Nombre, QtyItem = l.Cantidad, PrcItem = l.Precio })).ToArray();

    /// <summary>
    /// Nodo DscRcgGlobal (descuento/recargo global) que cuadra el documento con el total cobrado.
    /// <paramref name="ajuste"/> = Σ(líneas) − VenVentas.MontoTotal: &gt;0 descuento (absorbe descuento
    /// global, promociones y cortesía); &lt;0 recargo (absorbe el recargo de envases neto). Así el
    /// MntTotal del DTE siempre iguala lo realmente cobrado, sin tocar el precio de las líneas.
    /// <paramref name="aplicaExento"/> marca IndExeDR=1 cuando el ajuste recae sobre montos exentos.
    /// </summary>
    private static object[]? BuildDscRcgGlobal(int ajuste, bool aplicaExento)
    {
        if (ajuste == 0) return null;
        string tpoMov = ajuste > 0 ? "D" : "R";
        int valor = Math.Abs(ajuste);
        return aplicaExento
            ? [new { NroLinDR = 1, TpoMov = tpoMov, TpoValor = "$", ValorDR = valor, IndExeDR = 1 }]
            : [new { NroLinDR = 1, TpoMov = tpoMov, TpoValor = "$", ValorDR = valor }];
    }

    private static object ConstruirParsedData(
        int tipoDte, int folio, DteEmisorData emisor, DteReceptorData receptor, object[] detalle,
        object[]? referencias = null, int ajusteGlobal = 0, bool ajusteSobreExento = false)
    {
        object receptorObj = string.IsNullOrWhiteSpace(receptor.Giro)
            ? new
            {
                RUTRecep = receptor.Rut,
                RznSocRecep = receptor.RazonSocial,
                DirRecep = receptor.Direccion,
                CmnaRecep = receptor.Comuna
            }
            : new
            {
                RUTRecep = receptor.Rut,
                RznSocRecep = receptor.RazonSocial,
                GiroRecep = receptor.Giro,
                DirRecep = receptor.Direccion,
                CmnaRecep = receptor.Comuna
            };

        // Se usa un diccionario para poder incluir Referencia solo cuando aplica (notas de crédito).
        var parsed = new Dictionary<string, object>
        {
            ["Encabezado"] = new
            {
                IdDoc = new { TipoDTE = tipoDte, Folio = folio },
                Emisor = new
                {
                    RUTEmisor = emisor.Rut,
                    RznSocEmisor = emisor.RazonSocial,
                    GiroEmisor = emisor.Giro,
                    DirOrigen = emisor.Direccion,
                    CmnaOrigen = emisor.Comuna
                },
                Receptor = receptorObj
            },
            ["Detalle"] = detalle
        };
        var dscRcgGlobal = BuildDscRcgGlobal(ajusteGlobal, ajusteSobreExento);
        if (dscRcgGlobal != null)
            parsed["DscRcgGlobal"] = dscRcgGlobal;
        if (referencias is { Length: > 0 })
            parsed["Referencia"] = referencias;
        return parsed;
    }

    // ---- Extracción desde el XML firmado ----

    private static string ExtraerTed(string documentXmlBase64) =>
        ExtraerTedDeXml(Encoding.Latin1.GetString(Convert.FromBase64String(documentXmlBase64)));

    private static string ExtraerTedDeXml(string xml)
    {
        var match = Regex.Match(xml, "<TED.*?</TED>", RegexOptions.Singleline);
        return match.Success ? match.Value : string.Empty;
    }

    /// <summary>Lee los totales que calculó LibreDTE desde el XML firmado (maneja afecto/exento/mixto).</summary>
    private static DteMontos ExtraerTotales(string documentXmlBase64)
    {
        var xml = Encoding.Latin1.GetString(Convert.FromBase64String(documentXmlBase64));
        int Leer(string tag)
        {
            var m = Regex.Match(xml, $"<{tag}>(\\d+)</{tag}>");
            return m.Success ? int.Parse(m.Groups[1].Value) : 0;
        }
        int neto = Leer("MntNeto"), exento = Leer("MntExe"), iva = Leer("IVA"), total = Leer("MntTotal");
        return new DteMontos(neto, exento, iva, total);
    }
}
