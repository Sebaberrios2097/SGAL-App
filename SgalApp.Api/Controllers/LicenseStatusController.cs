using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Api.Services.Licensing;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/license")]
public class LicenseStatusController(LicenseState state, IOptions<LicensingOptions> options) : ControllerBase
{
    /// <summary>Estado de la licencia para el frontend (banner de prueba / pantalla de bloqueo).</summary>
    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status()
    {
        var enabled = options.Value.Enabled;
        return Ok(new
        {
            enabled,
            acceso = !enabled || state.AccesoPermitido,
            status = enabled ? state.Status : "disabled",
            plan = state.Plan,
            licenseExpiresAt = state.LicenseExpiresAt,
            graceDays = state.GraceDays,
            modulos = state.Modulos,
            modulosCompletos = state.ModulosCompletos,
            funcionalidades = state.Funcionalidades
        });
    }
}
