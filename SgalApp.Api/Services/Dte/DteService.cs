using Microsoft.EntityFrameworkCore;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Services.Dte;

/// <summary>
/// Orquesta la emisión de documentos tributarios contra LibreDTE Core: arma el Encabezado y el
/// Detalle, construye (firma y timbra) y renderiza el PDF. El enganche con las ventas reales y la
/// persistencia en SII_Dte_Emision se agregan en el siguiente tramo; por ahora expone además una
/// emisión de prueba con certificado y folios ficticios.
/// </summary>
public interface IDteService
{
    /// <summary>Emite una boleta de prueba (tipo 39) con certificado y CAF ficticios de LibreDTE.</summary>
    Task<DteEmisionResultado> EmitirPruebaAsync(CancellationToken cancellationToken = default);
}

public sealed class DteService : IDteService
{
    private const int EmisorId = 1;
    private readonly SgalContext _context;
    private readonly ILibreDteClient _client;

    public DteService(SgalContext context, ILibreDteClient client)
    {
        _context = context;
        _client = client;
    }

    public async Task<DteEmisionResultado> EmitirPruebaAsync(CancellationToken cancellationToken = default)
    {
        const int tipoDte = 39;   // boleta electrónica afecta
        const int folio = 1;

        var emisor = await ResolverEmisorAsync(cancellationToken);
        var receptor = DteReceptorData.ConsumidorFinal();
        var lineas = new List<DteLinea>
        {
            new("Cafe Latte", 1, 2500),
            new("Sandwich Ave Palta", 1, 4500)
        };

        // Certificado y CAF ficticios: permiten emitir localmente sin comprar nada.
        var certificado = await _client.CrearCertificadoFalsoAsync(
            "11111111-1", "SGAL Prueba", "prueba@sgal.cl", cancellationToken);
        var cafBase64 = await _client.CrearCafFalsoAsync(
            emisor.Rut, emisor.RazonSocial, tipoDte, 1, 100, cancellationToken);

        var parsedData = ConstruirParsedData(tipoDte, folio, emisor, receptor, lineas);
        var build = await _client.ConstruirAsync(parsedData, cafBase64, certificado, cancellationToken);
        var pdf = await _client.RenderizarPdfAsync(build.DocumentXml, cancellationToken);

        return new DteEmisionResultado
        {
            TipoDte = tipoDte,
            Folio = folio,
            Pdf = pdf,
            DocumentXml = build.DocumentXml
        };
    }

    /// <summary>Emisor configurado en SII_Emisor o, si no hay, datos de ejemplo para la prueba.</summary>
    private async Task<DteEmisorData> ResolverEmisorAsync(CancellationToken cancellationToken)
    {
        var e = await _context.SiiEmisor.AsNoTracking().FirstOrDefaultAsync(x => x.IdEmisor == EmisorId, cancellationToken);
        if (e != null && !string.IsNullOrWhiteSpace(e.Rut))
            return new DteEmisorData(e.Rut, e.RazonSocial, e.Giro, e.Direccion, e.Comuna);

        return new DteEmisorData(
            "76192083-9", "CAFE AROMA SpA", "Cafeteria y venta de alimentos",
            "Av. Providencia 1234", "Providencia");
    }

    /// <summary>
    /// Arma el objeto parsedData (Encabezado + Detalle) que consume builder/build. Los nombres de
    /// campo son los del esquema del SII (RUTEmisor, RznSocEmisor, …); LibreDTE calcula los Totales.
    /// </summary>
    private static object ConstruirParsedData(
        int tipoDte, int folio, DteEmisorData emisor, DteReceptorData receptor, IReadOnlyList<DteLinea> lineas)
    {
        var detalle = lineas.Select(l => new
        {
            NmbItem = l.Nombre,
            QtyItem = l.Cantidad,
            PrcItem = l.PrecioUnitario
        }).ToArray();

        return new
        {
            Encabezado = new
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
                Receptor = new
                {
                    RUTRecep = receptor.Rut,
                    RznSocRecep = receptor.RazonSocial,
                    DirRecep = receptor.Direccion,
                    CmnaRecep = receptor.Comuna
                }
            },
            Detalle = detalle
        };
    }
}
