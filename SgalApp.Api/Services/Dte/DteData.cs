namespace SgalApp.Api.Services.Dte;

/// <summary>Una línea de detalle de un documento tributario.</summary>
public sealed record DteLinea(string Nombre, int Cantidad, int PrecioUnitario);

/// <summary>Identidad del emisor usada para armar el Encabezado del DTE.</summary>
public sealed record DteEmisorData(
    string Rut, string RazonSocial, string Giro, string Direccion, string Comuna);

/// <summary>Datos del receptor. Para boleta a consumidor final se usan los genéricos "Sin RUT".</summary>
public sealed record DteReceptorData(
    string Rut, string RazonSocial, string Direccion, string Comuna, string? Giro = null)
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
