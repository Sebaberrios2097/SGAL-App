namespace SgalApp.Api.Services.Dte;

/// <summary>Una línea de detalle de un documento tributario.</summary>
public sealed record DteLinea(string Nombre, int Cantidad, int PrecioUnitario);

/// <summary>Identidad del emisor usada para armar el Encabezado del DTE.</summary>
/// <remarks>
/// <see cref="Ciudad"/> y los datos de resolución son opcionales: solo se usan en la
/// representación impresa (PDF) de la factura y no afectan el XML del DTE.
/// </remarks>
public sealed record DteEmisorData(
    string Rut, string RazonSocial, string Giro, string Direccion, string Comuna,
    string Ciudad = "", int? ResolucionNumero = null, DateOnly? ResolucionFecha = null);

/// <summary>Datos del receptor. Para boleta a consumidor final se usan los genéricos "Sin RUT".</summary>
public sealed record DteReceptorData(
    string Rut, string RazonSocial, string Direccion, string Comuna, string? Giro = null,
    string Ciudad = "", string? Contacto = null)
{
    /// <summary>Receptor genérico para boletas a consumidor final (sin RUT).</summary>
    public static DteReceptorData ConsumidorFinal() =>
        new("66666666-6", "Sin RUT", "Santiago", "Santiago");
}

/// <summary>Resultado de emitir un documento: PDF, XML firmado y metadatos.</summary>
public sealed class DteEmisionResultado
{
    public int TipoDte { get; init; }
    public int Folio { get; init; }
    public byte[] Pdf { get; init; } = [];
    public string DocumentXml { get; init; } = string.Empty;
}

public sealed record DteContingenciaResultado(int TipoDte, int Folio, int CantidadVentas, int MontoTotal, long? TrackId);

/// <summary>
/// Datos de una boleta emitida, listos para que el frontend imprima el ticket 80mm con su
/// timbre. El <see cref="Ted"/> es el XML del &lt;TED&gt; que se codifica como PDF417.
/// </summary>
public sealed class BoletaEmitida
{
    public int TipoDte { get; init; }
    public int Folio { get; init; }
    public DateTime Fecha { get; init; }
    public DteEmisorData Emisor { get; init; } = null!;
    public IReadOnlyList<DteLinea> Lineas { get; init; } = [];
    public DteMontos Montos { get; init; }
    public string Ted { get; init; } = string.Empty;
}
