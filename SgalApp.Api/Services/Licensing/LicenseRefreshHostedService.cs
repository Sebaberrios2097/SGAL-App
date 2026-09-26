using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;

namespace SgalApp.Api.Services.Licensing;

/// <summary>Carga el token cacheado al arrancar y revalida la licencia periódicamente.</summary>
public sealed class LicenseRefreshHostedService(
    ILicenseClient client,
    IOptions<LicensingOptions> options,
    ILogger<LicenseRefreshHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled) return;

        await client.CargarDesdeCacheAsync(stoppingToken);
        await client.ValidarAsync(stoppingToken); // Intento inicial (best-effort).

        var period = TimeSpan.FromHours(Math.Max(1, options.Value.RevalidateHours));
        using var timer = new PeriodicTimer(period);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try { await client.ValidarAsync(stoppingToken); }
            catch (Exception ex) { logger.LogWarning(ex, "Fallo al revalidar la licencia."); }
        }
    }
}
