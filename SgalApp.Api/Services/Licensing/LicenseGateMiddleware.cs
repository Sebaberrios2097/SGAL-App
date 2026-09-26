using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;

namespace SgalApp.Api.Services.Licensing;

/// <summary>
/// Bloquea las operaciones cuando la licencia no otorga acceso (expirada, suspendida o fuera de la
/// gracia offline). Deja pasar login/logout, el estado de licencia, health y las rutas no-API (para
/// que el frontend cargue y muestre la pantalla de bloqueo). Inactivo si el licenciamiento está apagado.
/// </summary>
public sealed class LicenseGateMiddleware(RequestDelegate next, IOptions<LicensingOptions> options)
{
    private static readonly string[] RutasPermitidas = { "/api/auth", "/api/license", "/api/health" };

    public async Task Invoke(HttpContext context, LicenseState state)
    {
        if (options.Value.Enabled && !state.AccesoPermitido)
        {
            var path = context.Request.Path.Value ?? string.Empty;
            var esApi = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase);
            var permitida = !esApi || RutasPermitidas.Any(r => path.StartsWith(r, StringComparison.OrdinalIgnoreCase));
            if (!permitida)
            {
                context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
                await context.Response.WriteAsJsonAsync(new
                {
                    mensaje = "La licencia está inactiva o expirada. Contacte al proveedor.",
                    status = state.Status
                });
                return;
            }
        }

        await next(context);
    }
}
