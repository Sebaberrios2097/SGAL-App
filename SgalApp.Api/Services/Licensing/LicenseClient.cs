using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SgalApp.Api.Configuration;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Services.Licensing;

public interface ILicenseClient
{
    /// <summary>Carga el token cacheado (si existe) al arrancar, para operar offline dentro de la gracia.</summary>
    Task CargarDesdeCacheAsync(CancellationToken cancellationToken = default);

    /// <summary>Revalida contra la License API; si tiene éxito, actualiza el estado y sincroniza módulos.</summary>
    Task<bool> ValidarAsync(CancellationToken cancellationToken = default);
}

public sealed class LicenseClient(
    IHttpClientFactory httpClientFactory,
    IServiceScopeFactory scopeFactory,
    LicenseState state,
    IOptions<LicensingOptions> options,
    IWebHostEnvironment env,
    ILogger<LicenseClient> logger) : ILicenseClient
{
    private readonly LicensingOptions _options = options.Value;

    private string CachePath()
    {
        var dir = Path.Combine(env.ContentRootPath, "license-cache");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "token.jwt");
    }

    public async Task CargarDesdeCacheAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var path = CachePath();
            if (!File.Exists(path)) return;
            var token = await File.ReadAllTextAsync(path, cancellationToken);
            if (TryLeerToken(token, out var datos))
                state.Actualizar(datos.Status, datos.LicenseExpiresAt, datos.GraceDays, datos.Plan,
                    datos.Modulos, datos.ModulosCompletos, datos.Funcionalidades, datos.IssuedAt);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo cargar el token de licencia cacheado.");
        }
    }

    public async Task<bool> ValidarAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiBaseUrl)
            || !Guid.TryParse(_options.InstallationId, out var installationId)
            || string.IsNullOrWhiteSpace(_options.LicenseKey))
        {
            logger.LogWarning("Licencia habilitada pero mal configurada (ApiBaseUrl/InstallationId/LicenseKey).");
            return false;
        }

        try
        {
            var client = httpClientFactory.CreateClient(nameof(LicenseClient));
            client.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
            var payload = new
            {
                installationId,
                licenseKey = _options.LicenseKey,
                appVersion = "1.0.0",
                clientTime = DateTime.UtcNow
            };
            var response = await client.PostAsJsonAsync(
                $"{_options.ApiBaseUrl.TrimEnd('/')}/api/license/validate", payload, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("La License API rechazó la validación: {Code}.", (int)response.StatusCode);
                return false;
            }

            var body = await response.Content.ReadFromJsonAsync<ValidateResponse>(cancellationToken);
            if (body?.Token == null || !TryLeerToken(body.Token, out var datos))
            {
                logger.LogWarning("La License API devolvió un token inválido o no verificable.");
                return false;
            }

            state.Actualizar(datos.Status, datos.LicenseExpiresAt, datos.GraceDays, datos.Plan,
                datos.Modulos, datos.ModulosCompletos, datos.Funcionalidades, DateTime.UtcNow);
            await File.WriteAllTextAsync(CachePath(), body.Token, cancellationToken);
            await SincronizarEntitlementsAsync(datos.Modulos, datos.ModulosCompletos, datos.Funcionalidades, cancellationToken);
            logger.LogInformation("Licencia validada: estado {Status}, {Count} módulos.", datos.Status, datos.Modulos.Length);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo contactar la License API; se opera con el token cacheado (gracia).");
            return false;
        }
    }

    /// <summary>Espejo de módulos: sobrescribe Org_Modulos.Habilitado según el token (núcleo siempre activo).</summary>
    private async Task SincronizarEntitlementsAsync(IReadOnlyCollection<string> modulos,
        IReadOnlyCollection<string> modulosCompletos, IReadOnlyCollection<string> funcionalidades,
        CancellationToken cancellationToken)
    {
        var contratados = new HashSet<string>(modulos, StringComparer.OrdinalIgnoreCase);
        var completos = new HashSet<string>(modulosCompletos, StringComparer.OrdinalIgnoreCase);
        var funciones = new HashSet<string>(funcionalidades, StringComparer.OrdinalIgnoreCase);
        using var scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<SgalContext>();

        var moduleList = await context.SegModulos.Include(m => m.ConfiguracionOrganizacion)
            .ToListAsync(cancellationToken);
        foreach (var module in moduleList)
        {
            var habilitado = module.EsNucleo || contratados.Contains(module.Codigo);
            var todas = module.EsNucleo || completos.Contains(module.Codigo);
            if (module.ConfiguracionOrganizacion == null)
                context.OrgModulos.Add(new OrgModulo
                {
                    IdModulo = module.IdModulo,
                    Habilitado = habilitado,
                    TodasFuncionalidades = todas,
                    FechaActualizacion = DateTime.UtcNow
                });
            else
            {
                module.ConfiguracionOrganizacion.Habilitado = habilitado;
                module.ConfiguracionOrganizacion.TodasFuncionalidades = todas;
                module.ConfiguracionOrganizacion.FechaActualizacion = DateTime.UtcNow;
            }
        }

        // Org_Permisos es el espejo de las funcionalidades habilitadas en módulos parciales.
        var permisos = await context.SegPermisos.Include(p => p.Modulo)
            .Include(p => p.ConfiguracionOrganizacion).ToListAsync(cancellationToken);
        foreach (var permiso in permisos)
        {
            var moduloControlado = !permiso.Modulo.EsNucleo;
            if (!moduloControlado) continue;

            var debeExistir = contratados.Contains(permiso.Modulo.Codigo)
                && !completos.Contains(permiso.Modulo.Codigo)
                && funciones.Contains(permiso.Codigo);
            if (debeExistir && permiso.ConfiguracionOrganizacion == null)
                context.OrgPermisos.Add(new OrgPermiso { IdPermiso = permiso.IdPermiso, FechaActualizacion = DateTime.UtcNow });
            else if (!debeExistir && permiso.ConfiguracionOrganizacion != null)
                context.OrgPermisos.Remove(permiso.ConfiguracionOrganizacion);
        }
        await context.SaveChangesAsync(cancellationToken);
    }

    private sealed record TokenData(string Status, DateTime? LicenseExpiresAt, int GraceDays, string Plan,
        string[] Modulos, string[] ModulosCompletos, string[] Funcionalidades, DateTime IssuedAt);

    private bool TryLeerToken(string token, out TokenData datos)
    {
        datos = new TokenData("unknown", null, 0, string.Empty, [], [], [], DateTime.MinValue);
        try
        {
            var ecdsa = ECDsa.Create();
            ecdsa.ImportFromPem(_options.PublicKeyPem);
            var parameters = new TokenValidationParameters
            {
                ValidIssuer = "sgal-license",
                ValidAudience = "sgal-app",
                IssuerSigningKey = new ECDsaSecurityKey(ecdsa),
                ValidateIssuerSigningKey = true,
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = false // La gracia offline se maneja en LicenseState, no aquí.
            };
            new JwtSecurityTokenHandler().ValidateToken(token, parameters, out var validated);
            var jwt = (JwtSecurityToken)validated;

            var status = jwt.Claims.FirstOrDefault(c => c.Type == "status")?.Value ?? "unknown";
            var plan = jwt.Claims.FirstOrDefault(c => c.Type == "plan")?.Value ?? string.Empty;
            var modulos = jwt.Claims.Where(c => c.Type == "modules").Select(c => c.Value).ToArray();
            var entitlementV2 = jwt.Claims.Any(c => c.Type == "entitlementsVersion" && c.Value == "2");
            var modulosCompletos = entitlementV2
                ? jwt.Claims.Where(c => c.Type == "fullModules").Select(c => c.Value).ToArray()
                : modulos; // Compatibilidad con tokens emitidos antes de la granularidad.
            var funcionalidades = jwt.Claims.Where(c => c.Type == "features").Select(c => c.Value).ToArray();
            var graceDays = int.TryParse(jwt.Claims.FirstOrDefault(c => c.Type == "graceDays")?.Value, out var g) ? g : 0;
            DateTime? licenseExpiresAt = long.TryParse(jwt.Claims.FirstOrDefault(c => c.Type == "licenseExpiresAt")?.Value, out var exp)
                ? DateTimeOffset.FromUnixTimeSeconds(exp).UtcDateTime : null;

            datos = new TokenData(status, licenseExpiresAt, graceDays, plan,
                modulos, modulosCompletos, funcionalidades, jwt.ValidFrom);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Falló la verificación de la firma del token de licencia.");
            return false;
        }
    }

    private sealed record ValidateResponse(string Token, string Status, DateTime? LicenseExpiresAt, string[] Modules, string Plan, int GraceDays);
}
