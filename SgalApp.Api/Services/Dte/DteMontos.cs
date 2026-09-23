namespace SgalApp.Api.Services.Dte;

/// <summary>Desglose de montos de un documento: neto, exento, IVA y total (en pesos enteros).</summary>
public readonly record struct DteMontos(int Neto, int Exento, int Iva, int Total);

/// <summary>
/// Cálculo compartido de los montos de una venta según sea afecta o exenta de IVA. Centraliza la
/// lógica que hoy se repite en los puntos de cobro (venta directa, caja y Point):
///   - Afecto: el total incluye IVA; el neto se obtiene dividiendo por 1.19 y el IVA es la diferencia.
///   - Exento: el total es monto exento; no hay neto afecto ni IVA.
/// Se conserva el mismo redondeo que usa el código actual para no alterar los montos ya calculados.
/// </summary>
public static class DteMontosCalculator
{
    /// <summary>Factor de IVA (19%).</summary>
    public const double FactorIva = 1.19;

    /// <summary>
    /// Descompone un total bruto (lo que paga el cliente) en neto/exento/IVA.
    /// </summary>
    /// <param name="totalBruto">Total a cobrar, ya con descuentos aplicados.</param>
    /// <param name="esExento">Si la venta es exenta de IVA.</param>
    public static DteMontos Calcular(int totalBruto, bool esExento)
    {
        if (esExento)
            return new DteMontos(Neto: 0, Exento: totalBruto, Iva: 0, Total: totalBruto);

        int neto = (int)Math.Round(totalBruto / FactorIva);
        int iva = totalBruto - neto;
        return new DteMontos(Neto: neto, Exento: 0, Iva: iva, Total: totalBruto);
    }
}
