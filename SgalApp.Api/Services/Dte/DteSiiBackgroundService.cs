namespace SgalApp.Api.Services.Dte;

/// <summary>Procesa periódicamente la cola SII. En desarrollo el servicio no hace nada.</summary>
public sealed class DteSiiBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<DteSiiBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Da tiempo a que la aplicación y la base terminen de iniciar.
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(2));

        do
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IDteService>();
                await service.ProcesarPendientesSiiAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Falló el procesamiento periódico de la cola SII.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
