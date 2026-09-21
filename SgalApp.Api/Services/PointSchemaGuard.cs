using Microsoft.EntityFrameworkCore;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Services
{
    /// <summary>
    /// Evita crear una orden remota si la base local todavía no soporta el flujo Point
    /// actual. Sin esta comprobación, Mercado Pago puede conservar una orden huérfana.
    /// </summary>
    public static class PointSchemaGuard
    {
        public static async Task<string?> GetConfigurationErrorAsync(
            SgalContext context,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var ready = await context.Database
                    .SqlQueryRaw<int>("SELECT CASE WHEN COL_LENGTH('dbo.Ven_Ordenes_Point', 'Es_Caja') IS NULL THEN 0 ELSE 1 END AS [Value]")
                    .SingleAsync(cancellationToken);

                return ready == 1
                    ? null
                    : "La base de datos no tiene aplicada la actualización 20260922_Caja_Point.sql.";
            }
            catch (Exception)
            {
                return "No fue posible validar la estructura de cobros Point en la base de datos.";
            }
        }
    }
}
