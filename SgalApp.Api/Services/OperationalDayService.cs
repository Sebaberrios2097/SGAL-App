using Microsoft.EntityFrameworkCore;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Services;

public static class OperationalDayService
{
    public static (DateTime Inicio, DateTime Fin) Range(DateTime moment, TimeSpan opening, TimeSpan closing)
    {
        var start = moment.Date.Add(opening);
        if (moment < start) start = start.AddDays(-1);
        var end = start.Date.Add(closing);
        if (closing <= opening) end = end.AddDays(1);
        return (start, end);
    }

    public static async Task<(DateTime Inicio, DateTime Fin, TimeSpan Apertura, TimeSpan Cierre)> CurrentRangeAsync(
        SgalContext context, DateTime? moment = null, CancellationToken cancellationToken = default)
    {
        var configuration = await context.OrgConfiguracion.AsNoTracking()
            .Where(item => item.IdConfiguracion == 1)
            .Select(item => new { item.JornadaHoraApertura, item.JornadaHoraCierre })
            .FirstOrDefaultAsync(cancellationToken);
        var opening = configuration?.JornadaHoraApertura ?? new TimeSpan(6, 0, 0);
        var closing = configuration?.JornadaHoraCierre ?? new TimeSpan(2, 0, 0);
        var range = Range(moment ?? DateTime.Now, opening, closing);
        return (range.Inicio, range.Fin, opening, closing);
    }

    public static async Task<int> NextSaleSequenceAsync(SgalContext context, DateTime moment,
        CancellationToken cancellationToken = default)
    {
        var range = await CurrentRangeAsync(context, moment, cancellationToken);
        return (await context.VenVentas
            .Where(sale => sale.FechaVenta >= range.Inicio && sale.FechaVenta < range.Fin)
            .MaxAsync(sale => (int?)sale.CorrelativoDiario, cancellationToken) ?? 0) + 1;
    }
}
