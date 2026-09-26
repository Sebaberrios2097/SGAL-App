using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.Security;
using SgalApp.Api.Services;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/daily-operations")]
public sealed class DailyOperationsController(SgalContext context) : ControllerBase
{
    [HttpGet]
    [Permission(Permissions.DailyOperationsView)]
    public async Task<IActionResult> Get([FromQuery] DateOnly? fecha, CancellationToken cancellationToken)
    {
        var configuration = await context.OrgConfiguracion.AsNoTracking()
            .Where(item => item.IdConfiguracion == 1)
            .Select(item => new { item.JornadaHoraApertura, item.JornadaHoraCierre, item.CajaPropinasHabilitadas })
            .FirstOrDefaultAsync(cancellationToken);
        var opening = configuration?.JornadaHoraApertura ?? new TimeSpan(6, 0, 0);
        var closing = configuration?.JornadaHoraCierre ?? new TimeSpan(2, 0, 0);
        var reference = (fecha?.ToDateTime(TimeOnly.MinValue) ?? DateTime.Now.Date).Add(opening);
        var (start, end) = OperationalDayService.Range(reference, opening, closing);

        var sales = await context.VenVentas.AsNoTracking()
            .Where(sale => sale.FechaVenta >= start && sale.FechaVenta < end && sale.IdBitacora == null)
            .OrderBy(sale => sale.CorrelativoDiario).ThenBy(sale => sale.IdVenta)
            .Select(sale => new
            {
                sale.IdVenta, sale.CorrelativoDiario, sale.FechaVenta, sale.MontoTotal,
                sale.IdEstadoVenta, Estado = sale.IdEstadoVentaNavigation.NombreEstadoVenta,
                Vendedor = sale.IdUsuarioNavigation.EmpEmpleados.Where(employee => employee.Activo)
                    .Select(employee => employee.Alias ?? (employee.Nombres + " " + employee.Apellido1)).FirstOrDefault()
                    ?? sale.IdUsuarioNavigation.NombreUsuario,
                Canal = sale.IdTurnoCaja != null ? "caja" : "venta",
                IdTurnoVenta = sale.IdTurno,
                IdTurnoCaja = sale.IdTurnoCaja,
                MetodosPago = sale.VenMetodosPagoVenta.Select(payment => new
                {
                    payment.IdMetodoPago, payment.IdMetodoPagoNavigation.NombreMetodoPago, payment.Monto
                }).ToList(),
                Propina = configuration != null && configuration.CajaPropinasHabilitadas
                    ? sale.VenOrdenesPoint.Sum(order => order.MontoPropina ?? 0) : 0
            }).ToListAsync(cancellationToken);

        var turns = await context.TurTurno.AsNoTracking()
            .Where(turn => turn.FechaApertura < end && (turn.FechaCierre == null || turn.FechaCierre >= start))
            .OrderBy(turn => turn.FechaApertura)
            .Select(turn => new
            {
                turn.IdTurno, turn.FechaApertura, turn.FechaCierre, turn.IdEstadoTurno,
                Usuario = turn.IdUsuarioNavigation.EmpEmpleados.Where(employee => employee.Activo)
                    .Select(employee => employee.Alias ?? (employee.Nombres + " " + employee.Apellido1)).FirstOrDefault()
                    ?? turn.IdUsuarioNavigation.NombreUsuario,
                VentaCantidad = turn.VenVentas.Count(sale => sale.FechaVenta >= start && sale.FechaVenta < end && sale.IdBitacora == null),
                VentaTotal = turn.VenVentas.Where(sale => sale.FechaVenta >= start && sale.FechaVenta < end
                    && sale.IdBitacora == null && sale.IdEstadoVenta == EstadosVenta.Terminada).Sum(sale => (int?)sale.MontoTotal) ?? 0,
                CajaCantidad = turn.VenVentasCaja.Count(sale => sale.FechaVenta >= start && sale.FechaVenta < end && sale.IdBitacora == null),
                CajaTotal = turn.VenVentasCaja.Where(sale => sale.FechaVenta >= start && sale.FechaVenta < end
                    && sale.IdBitacora == null && sale.IdEstadoVenta == EstadosVenta.Terminada).Sum(sale => (int?)sale.MontoTotal) ?? 0,
                turn.DiferenciaTotal
            }).ToListAsync(cancellationToken);

        return Ok(new
        {
            Fecha = DateOnly.FromDateTime(start), Inicio = start, Fin = end,
            HoraApertura = opening, HoraCierre = closing,
            PropinasHabilitadas = configuration?.CajaPropinasHabilitadas ?? false,
            Resumen = new
            {
                CantidadVentas = sales.Count(sale => sale.IdEstadoVenta == EstadosVenta.Terminada),
                TotalVentas = sales.Where(sale => sale.IdEstadoVenta == EstadosVenta.Terminada).Sum(sale => sale.MontoTotal),
                TotalPropinas = sales.Sum(sale => sale.Propina),
                Turnos = turns.Count
            },
            Ventas = sales,
            TurnosVenta = turns.Where(turn => turn.VentaCantidad > 0).ToList(),
            TurnosCaja = turns.Where(turn => turn.CajaCantidad > 0).ToList()
        });
    }
}
