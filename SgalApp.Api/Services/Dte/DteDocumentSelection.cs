namespace SgalApp.Api.Services.Dte;

/// <summary>
/// Valores aceptados desde las pantallas de cobro. Mantiene compatibilidad con
/// "boleta" y "factura", y hace explícita la condición exenta del documento.
/// </summary>
public static class DteDocumentSelection
{
    public const string Boleta = "boleta";
    public const string BoletaExenta = "boleta_exenta";
    public const string Factura = "factura";
    public const string FacturaExenta = "factura_exenta";

    public static bool IsSupported(string? value) => value is Boleta or BoletaExenta or Factura or FacturaExenta;
    public static bool IsInvoice(string? value) => value is Factura or FacturaExenta;
    public static bool IsExempt(string? value) => value is BoletaExenta or FacturaExenta;
}
