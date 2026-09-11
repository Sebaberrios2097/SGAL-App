using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SieteVidasAPI.Security;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class PermissionAttribute : TypeFilterAttribute
{
    public PermissionAttribute(string code) : base(typeof(PermissionFilter))
    {
        Arguments = [code];
    }
}

public sealed class PermissionFilter(IPermissionService permissions, string code) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var idText = context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(idText, out var userId))
        {
            context.Result = new UnauthorizedObjectResult(new { mensaje = "Debe iniciar sesión." });
            return;
        }

        if (context.HttpContext.User.FindFirstValue("must_change_password") == "true")
        {
            context.Result = new ObjectResult(new { mensaje = "Debe cambiar su contraseña antes de continuar." })
            { StatusCode = StatusCodes.Status403Forbidden };
            return;
        }

        var accepted = code.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var allowed = false;
        foreach (var candidate in accepted)
            if (await permissions.HasPermissionAsync(userId, candidate)) { allowed = true; break; }
        if (!allowed)
            context.Result = new ObjectResult(new { mensaje = "No tiene permiso para realizar esta acción." })
            { StatusCode = StatusCodes.Status403Forbidden };
    }
}
