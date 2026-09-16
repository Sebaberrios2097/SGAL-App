using System.Globalization;
using SgalApp.Infrastructure.Context;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.Security;
using SgalApp.Api.Services;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/admin-dashboard")]
public class AdminDashboardController : ControllerBase
{
    private readonly SgalContext _context;
    private readonly IPermissionService _permissions;

    public AdminDashboardController(SgalContext context, IPermissionService permissions)
    {
        _context = context;
        _permissions = permissions;
    }

    [HttpGet("monthly-summary")]
    [Permission(Permissions.DashboardView)]
    public async Task<IActionResult> GetMonthlySummary([FromQuery] int year, [FromQuery] int month)
    {
        if (!TryGetMonthRange(year, month, out var start, out var end))
            return BadRequest(new { mensaje = "El año o mes no es válido." });

        var sales = _context.VenVentas.AsNoTracking()
            .Where(x => x.IdEstadoVenta == EstadosVenta.Terminada && x.IdBitacora == null && x.FechaVenta >= start && x.FechaVenta < end);
        var totals = await sales.GroupBy(_ => 1).Select(g => new
        {
            TotalVentas = g.Sum(x => x.MontoTotal),
            CantidadVentas = g.Count(),
            TicketPromedio = (decimal)g.Sum(x => x.MontoTotal) / g.Count()
        }).FirstOrDefaultAsync();

        var dailySales = await sales.GroupBy(x => x.FechaVenta.Day)
            .Select(g => new { Dia = g.Key, Monto = g.Sum(x => x.MontoTotal), Cantidad = g.Count() })
            .OrderBy(x => x.Dia).ToListAsync();

        var paymentMethods = await _context.VenMetodosPagoVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new { x.IdMetodoPago, x.IdMetodoPagoNavigation.NombreMetodoPago })
            .Select(g => new { g.Key.IdMetodoPago, g.Key.NombreMetodoPago, Monto = g.Sum(x => x.Monto) })
            .OrderByDescending(x => x.Monto).ToListAsync();

        var topProducts = await _context.VenDetalleVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new { x.IdProducto, x.IdProductoNavigation.NombreProducto })
            .Select(g => new { g.Key.IdProducto, g.Key.NombreProducto, Cantidad = g.Sum(x => x.Cantidad), Monto = g.Sum(x => x.Subtotal) })
            .OrderByDescending(x => x.Cantidad).ThenByDescending(x => x.Monto).Take(8).ToListAsync();

        var topCategories = await _context.VenDetalleVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new
            {
                x.IdProductoNavigation.IdCategoriaProducto,
                x.IdProductoNavigation.IdCategoriaProductoNavigation.NombreCategoriaProducto
            })
            .Select(g => new
            {
                g.Key.IdCategoriaProducto,
                NombreCategoria = g.Key.NombreCategoriaProducto,
                Cantidad = g.Sum(x => x.Cantidad),
                Monto = g.Sum(x => x.Subtotal)
            })
            .OrderByDescending(x => x.Cantidad).ThenByDescending(x => x.Monto).Take(8).ToListAsync();

        var turnCount = await _context.TurTurno.CountAsync(x => x.FechaApertura >= start && x.FechaApertura < end);
        return Ok(new
        {
            Periodo = new { year, month, Dias = DateTime.DaysInMonth(year, month) },
            TotalVentas = totals?.TotalVentas ?? 0,
            CantidadVentas = totals?.CantidadVentas ?? 0,
            TicketPromedio = totals?.TicketPromedio ?? 0,
            CantidadTurnos = turnCount,
            VentasDiarias = dailySales,
            MetodosPago = paymentMethods,
            ProductosMasVendidos = topProducts,
            CategoriasMasVendidas = topCategories
        });
    }

    // Resumen configurable por rango de fechas y granularidad (día/semana/mes).
    [HttpGet("overview")]
    [Permission(Permissions.DashboardView)]
    public async Task<IActionResult> GetOverview([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] string granularity = "day")
    {
        var start = from.Date;
        var end = to.Date.AddDays(1);
        if (end <= start) return BadRequest(new { mensaje = "El rango de fechas no es válido." });
        if ((end - start).TotalDays > 366) return BadRequest(new { mensaje = "El rango no puede superar los 366 días." });
        var gran = (granularity ?? "day").ToLowerInvariant();
        if (gran is not ("day" or "week" or "month")) gran = "day";

        var sales = _context.VenVentas.AsNoTracking()
            .Where(x => x.IdEstadoVenta == EstadosVenta.Terminada && x.IdBitacora == null && x.FechaVenta >= start && x.FechaVenta < end);

        var totals = await sales.GroupBy(_ => 1).Select(g => new
        {
            TotalVentas = g.Sum(x => x.MontoTotal),
            CantidadVentas = g.Count()
        }).FirstOrDefaultAsync();
        var totalIngresos = totals?.TotalVentas ?? 0;
        var cantidadVentas = totals?.CantidadVentas ?? 0;

        var dailySales = await sales.GroupBy(x => x.FechaVenta.Date)
            .Select(g => new { Fecha = g.Key, Monto = g.Sum(x => x.MontoTotal), Cantidad = g.Count() })
            .ToListAsync();

        // Egresos: órdenes de compra recibidas (total o parcial), fechadas por su llegada.
        var estadosRecibidos = new[] { "Completada", "Recibida parcialmente" };
        var dailyEgresos = await _context.InvOrdenCompra.AsNoTracking()
            .Where(o => estadosRecibidos.Contains(o.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra)
                && o.FechaLlegadaPedido >= start && o.FechaLlegadaPedido < end)
            .GroupBy(o => o.FechaLlegadaPedido.Date)
            .Select(g => new { Fecha = g.Key, Monto = g.Sum(o => o.MontoTotalReal ?? o.MontoTotal) })
            .ToListAsync();
        var totalEgresos = dailyEgresos.Sum(x => x.Monto);

        var salesByDay = dailySales.ToDictionary(x => x.Fecha);
        var egresosByDay = dailyEgresos.ToDictionary(x => x.Fecha, x => x.Monto);

        // Buckets continuos según granularidad (se rellenan los huecos).
        var buckets = new List<int[]>(); // [ingresos, egresos, cantidad]
        var labels = new List<string>();
        var orders = new List<DateTime>();
        var index = new Dictionary<string, int>();
        for (var day = start; day < end; day = day.AddDays(1))
        {
            var (key, label, order) = BucketOf(day, gran);
            if (!index.TryGetValue(key, out var idx))
            {
                idx = buckets.Count;
                index[key] = idx;
                buckets.Add(new[] { 0, 0, 0 });
                labels.Add(label);
                orders.Add(order);
            }
            if (salesByDay.TryGetValue(day, out var s)) { buckets[idx][0] += s.Monto; buckets[idx][2] += s.Cantidad; }
            if (egresosByDay.TryGetValue(day, out var e)) { buckets[idx][1] += e; }
        }
        var series = Enumerable.Range(0, buckets.Count)
            .OrderBy(i => orders[i])
            .Select(i => new
            {
                etiqueta = labels[i],
                ingresos = buckets[i][0],
                egresos = buckets[i][1],
                resultado = buckets[i][0] - buckets[i][1],
                cantidadVentas = buckets[i][2]
            }).ToList();

        var paymentMethods = await _context.VenMetodosPagoVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new { x.IdMetodoPago, x.IdMetodoPagoNavigation.NombreMetodoPago })
            .Select(g => new { g.Key.IdMetodoPago, g.Key.NombreMetodoPago, Monto = g.Sum(x => x.Monto) })
            .OrderByDescending(x => x.Monto).ToListAsync();

        var topProducts = await _context.VenDetalleVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new { x.IdProducto, x.IdProductoNavigation.NombreProducto })
            .Select(g => new { g.Key.IdProducto, g.Key.NombreProducto, Cantidad = g.Sum(x => x.Cantidad), Monto = g.Sum(x => x.Subtotal) })
            .OrderByDescending(x => x.Cantidad).ThenByDescending(x => x.Monto).Take(8).ToListAsync();

        var topCategories = await _context.VenDetalleVenta.AsNoTracking()
            .Where(x => x.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && x.IdVentaNavigation.IdBitacora == null
                && x.IdVentaNavigation.FechaVenta >= start && x.IdVentaNavigation.FechaVenta < end)
            .GroupBy(x => new { x.IdProductoNavigation.IdCategoriaProducto, x.IdProductoNavigation.IdCategoriaProductoNavigation.NombreCategoriaProducto })
            .Select(g => new { g.Key.IdCategoriaProducto, NombreCategoria = g.Key.NombreCategoriaProducto, Cantidad = g.Sum(x => x.Cantidad), Monto = g.Sum(x => x.Subtotal) })
            .OrderByDescending(x => x.Cantidad).ThenByDescending(x => x.Monto).Take(8).ToListAsync();

        var cantidadTurnos = await _context.TurTurno.CountAsync(x => x.FechaApertura >= start && x.FechaApertura < end);

        // Flujo de caja: esperado vs real por método (turnos del rango).
        var porMetodo = await _context.TurTurnoDesglose.AsNoTracking()
            .Where(d => d.IdTurnoNavigation.FechaApertura >= start && d.IdTurnoNavigation.FechaApertura < end)
            .GroupBy(d => d.IdMetodoPagoNavigation.NombreMetodoPago)
            .Select(g => new { NombreMetodoPago = g.Key, Esperado = g.Sum(x => x.MontoEsperado), Real = g.Sum(x => x.MontoReal) })
            .ToListAsync();
        var flujoPorMetodo = porMetodo.Select(m => new { m.NombreMetodoPago, m.Esperado, m.Real, Diferencia = m.Real - m.Esperado }).ToList();

        // Efectivo por tipo de movimiento (1 = Apertura, 2 = Cierre).
        var efectivo = await _context.TurTurnoDesgloseEfectivo.AsNoTracking()
            .Where(e => e.IdTurnoNavigation.FechaApertura >= start && e.IdTurnoNavigation.FechaApertura < end)
            .GroupBy(e => e.IdTipoMovimiento)
            .Select(g => new { Tipo = g.Key, Monto = g.Sum(x => x.Cantidad * x.IdDenominacionNavigation.Valor) })
            .ToListAsync();

        var diffByDay = await _context.TurTurno.AsNoTracking()
            .Where(t => t.FechaApertura >= start && t.FechaApertura < end && t.DiferenciaTotal != null)
            .GroupBy(t => t.FechaApertura.Date)
            .Select(g => new { Fecha = g.Key, Diferencia = g.Sum(x => x.DiferenciaTotal ?? 0) })
            .OrderBy(x => x.Fecha).ToListAsync();

        var tips = await GetTipsByDayAsync(start, end);
        var totalPropinas = tips.Values.Sum();

        return Ok(new
        {
            periodo = new { from = start, to = end.AddDays(-1), granularity = gran },
            totalIngresos,
            totalEgresos,
            resultado = totalIngresos - totalEgresos,
            cantidadVentas,
            ticketPromedio = cantidadVentas > 0 ? (decimal)totalIngresos / cantidadVentas : 0,
            totalPropinas,
            cantidadTurnos,
            diferenciaCajaTotal = diffByDay.Sum(x => x.Diferencia),
            series,
            metodosPago = paymentMethods,
            productosMasVendidos = topProducts,
            categoriasMasVendidas = topCategories,
            flujoCaja = new
            {
                porMetodo = flujoPorMetodo,
                efectivoApertura = efectivo.FirstOrDefault(x => x.Tipo == 1)?.Monto ?? 0,
                efectivoCierre = efectivo.FirstOrDefault(x => x.Tipo == 2)?.Monto ?? 0,
                diferenciaPorDia = diffByDay
            }
        });
    }

    // Dashboard dedicado a turnos: qué se movió por turno, por barista y por producto
    // dentro de un rango configurable (día/semana/mes/personalizado).
    [HttpGet("turns-overview")]
    [Permission(Permissions.TurnRecordsDashboardView)]
    public async Task<IActionResult> GetTurnsOverview([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] string granularity = "day")
    {
        var start = from.Date;
        var end = to.Date.AddDays(1);
        if (end <= start) return BadRequest(new { mensaje = "El rango de fechas no es válido." });
        if ((end - start).TotalDays > 366) return BadRequest(new { mensaje = "El rango no puede superar los 366 días." });
        var gran = (granularity ?? "day").ToLowerInvariant();
        if (gran is not ("day" or "week" or "month")) gran = "day";

        // Un registro por turno con sus agregados de ventas y consumos de bitácora.
        var turnos = await _context.TurTurno.AsNoTracking()
            .Where(t => t.FechaApertura >= start && t.FechaApertura < end)
            .OrderBy(t => t.FechaApertura)
            .Select(t => new
            {
                t.IdTurno,
                t.IdUsuario,
                Usuario = t.IdUsuarioNavigation.NombreUsuario,
                Empleado = t.IdUsuarioNavigation.EmpEmpleados.Where(e => e.Activo)
                    .Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault(),
                t.FechaApertura,
                t.FechaCierre,
                t.IdEstadoTurno,
                Estado = t.IdEstadoTurnoNavigation.NombreEstadoTurno,
                t.DiferenciaTotal,
                // Ventas normales del turno (excluye consumos de empleado, Id_Bitacora != null).
                CantidadVentas = t.VenVentas.Count(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null),
                Monto = t.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null).Sum(v => (int?)v.MontoTotal) ?? 0,
                Unidades = t.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null)
                    .SelectMany(v => v.VenDetalleVenta).Sum(d => (int?)d.Cantidad) ?? 0,
                // Consumos del empleado del turno (ventas de consumo asociadas a la bitácora).
                ConsumoUnidades = t.VenVentas.Where(v => v.IdBitacora != null && v.IdEstadoVenta != EstadosVenta.Cancelada)
                    .SelectMany(v => v.VenDetalleVenta).Where(d => !d.EsCortesia).Sum(d => (int?)d.Cantidad) ?? 0,
                CortesiaUnidades = t.VenVentas.Where(v => v.IdBitacora != null && v.IdEstadoVenta != EstadosVenta.Cancelada)
                    .SelectMany(v => v.VenDetalleVenta).Where(d => d.EsCortesia).Sum(d => (int?)d.Cantidad) ?? 0
            })
            .ToListAsync();

        var tipsByTurn = await GetTipsByTurnAsync(turnos.Select(t => t.IdTurno).ToList());
        var tipsByDay = await GetTipsByDayAsync(start, end);

        int Propina(int idTurno) => tipsByTurn.TryGetValue(idTurno, out var p) ? p : 0;

        // KPIs del período.
        var totalVentas = turnos.Sum(t => t.Monto);
        var cantidadVentas = turnos.Sum(t => t.CantidadVentas);
        var unidadesVendidas = turnos.Sum(t => t.Unidades);
        var totalPropinas = tipsByDay.Values.Sum();
        var diferenciaCajaTotal = turnos.Sum(t => t.DiferenciaTotal ?? 0);

        // Serie temporal por granularidad (huecos incluidos).
        var buckets = new List<int[]>(); // [turnos, ventas, monto, propina, diferencia]
        var labels = new List<string>();
        var orders = new List<DateTime>();
        var index = new Dictionary<string, int>();
        int BucketIndex(DateTime day)
        {
            var (key, label, order) = BucketOf(day, gran);
            if (!index.TryGetValue(key, out var idx))
            {
                idx = buckets.Count;
                index[key] = idx;
                buckets.Add(new[] { 0, 0, 0, 0, 0 });
                labels.Add(label);
                orders.Add(order);
            }
            return idx;
        }
        for (var day = start; day < end; day = day.AddDays(1)) BucketIndex(day); // asegura continuidad
        foreach (var t in turnos)
        {
            var idx = BucketIndex(t.FechaApertura);
            buckets[idx][0] += 1;
            buckets[idx][1] += t.CantidadVentas;
            buckets[idx][2] += t.Monto;
            buckets[idx][4] += t.DiferenciaTotal ?? 0;
        }
        foreach (var kv in tipsByDay)
        {
            var idx = BucketIndex(kv.Key);
            buckets[idx][3] += kv.Value;
        }
        var series = Enumerable.Range(0, buckets.Count)
            .OrderBy(i => orders[i])
            .Select(i => new
            {
                etiqueta = labels[i],
                turnos = buckets[i][0],
                cantidadVentas = buckets[i][1],
                monto = buckets[i][2],
                propinas = buckets[i][3],
                diferencia = buckets[i][4]
            }).ToList();

        // Desglose por barista/usuario: a quién están asociados los turnos y montos.
        var porBarista = turnos
            .GroupBy(t => new { t.IdUsuario, t.Usuario, t.Empleado })
            .Select(g => new
            {
                g.Key.IdUsuario,
                g.Key.Usuario,
                g.Key.Empleado,
                turnos = g.Count(),
                turnosDescuadrados = g.Count(x => x.IdEstadoTurno == 3),
                cantidadVentas = g.Sum(x => x.CantidadVentas),
                monto = g.Sum(x => x.Monto),
                unidades = g.Sum(x => x.Unidades),
                consumoUnidades = g.Sum(x => x.ConsumoUnidades),
                cortesiaUnidades = g.Sum(x => x.CortesiaUnidades),
                propina = g.Sum(x => Propina(x.IdTurno)),
                diferencia = g.Sum(x => x.DiferenciaTotal ?? 0)
            })
            .OrderByDescending(x => x.monto)
            .ToList();

        // Productos vendidos durante los turnos del rango (unidades y monto; excluye consumos).
        var productosVendidos = await _context.VenDetalleVenta.AsNoTracking()
            .Where(d => d.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && d.IdVentaNavigation.IdBitacora == null
                && d.IdVentaNavigation.IdTurnoNavigation.FechaApertura >= start
                && d.IdVentaNavigation.IdTurnoNavigation.FechaApertura < end)
            .GroupBy(d => new { d.IdProducto, d.IdProductoNavigation.NombreProducto })
            .Select(g => new { g.Key.IdProducto, g.Key.NombreProducto, cantidad = g.Sum(x => x.Cantidad), monto = g.Sum(x => x.Subtotal) })
            .OrderByDescending(x => x.cantidad).ThenByDescending(x => x.monto)
            .Take(15).ToListAsync();

        // Ventas de consumo del empleado durante los turnos del rango, con su detalle. El frontend
        // las agrupa por barista y permite marcarlas como pagadas. Muestra adeudado vs cortesía.
        var consumosPorBarista = await _context.VenVentas.AsNoTracking()
            .Where(v => v.IdBitacora != null && v.IdEstadoVenta != EstadosVenta.Cancelada
                && v.IdTurnoNavigation.FechaApertura >= start && v.IdTurnoNavigation.FechaApertura < end)
            .OrderByDescending(v => v.FechaVenta)
            .Select(v => new
            {
                v.IdVenta,
                v.FechaVenta,
                v.PagadoPorEmpleado,
                idUsuario = v.IdTurnoNavigation.IdUsuario,
                usuario = v.IdTurnoNavigation.IdUsuarioNavigation.NombreUsuario,
                empleado = v.IdTurnoNavigation.IdUsuarioNavigation.EmpEmpleados
                    .Where(e => e.Activo).Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault(),
                montoAdeudado = v.VenDetalleVenta.Where(d => !d.EsCortesia).Sum(d => (int?)d.Subtotal) ?? 0,
                montoCortesia = v.VenDetalleVenta.Where(d => d.EsCortesia).Sum(d => (int?)d.Subtotal) ?? 0,
                items = v.VenDetalleVenta.Select(d => new
                {
                    d.IdProducto,
                    NombreProducto = d.IdProductoNavigation.NombreProducto,
                    d.Cantidad,
                    d.EsCortesia,
                    d.Subtotal
                }).ToList()
            })
            .ToListAsync();

        // Detalle turno a turno para la tabla inferior.
        var detalleTurnos = turnos.Select(t => new
        {
            t.IdTurno,
            t.IdUsuario,
            t.Usuario,
            t.Empleado,
            t.FechaApertura,
            t.FechaCierre,
            t.IdEstadoTurno,
            t.Estado,
            t.CantidadVentas,
            t.Unidades,
            t.Monto,
            t.ConsumoUnidades,
            t.CortesiaUnidades,
            Propina = Propina(t.IdTurno),
            Diferencia = t.DiferenciaTotal
        }).ToList();

        return Ok(new
        {
            periodo = new { from = start, to = end.AddDays(-1), granularity = gran },
            cantidadTurnos = turnos.Count,
            turnosAbiertos = turnos.Count(t => t.IdEstadoTurno == 1),
            turnosCerrados = turnos.Count(t => t.IdEstadoTurno == 2),
            turnosDescuadrados = turnos.Count(t => t.IdEstadoTurno == 3),
            totalVentas,
            cantidadVentas,
            unidadesVendidas,
            ticketPromedio = cantidadVentas > 0 ? (decimal)totalVentas / cantidadVentas : 0,
            ventaPromedioTurno = turnos.Count > 0 ? (decimal)totalVentas / turnos.Count : 0,
            totalPropinas,
            diferenciaCajaTotal,
            series,
            porBarista,
            productosVendidos,
            consumosPorBarista,
            turnos = detalleTurnos
        });
    }

    private static (string Key, string Label, DateTime Order) BucketOf(DateTime day, string gran)
    {
        var es = new CultureInfo("es-CL");
        if (gran == "month")
            return (day.ToString("yyyy-MM"), day.ToString("MMM yyyy", es), new DateTime(day.Year, day.Month, 1));
        if (gran == "week")
        {
            var diff = ((int)day.DayOfWeek + 6) % 7; // semana inicia lunes
            var monday = day.AddDays(-diff);
            return (monday.ToString("yyyy-MM-dd"), $"Sem {monday:dd/MM}", monday);
        }
        return (day.ToString("yyyy-MM-dd"), day.ToString("dd/MM"), day);
    }

    [HttpGet("turn-records/calendar")]
    [Permission(Permissions.TurnRecordsView)]
    public async Task<IActionResult> GetTurnCalendar([FromQuery] int year, [FromQuery] int month)
    {
        if (!TryGetMonthRange(year, month, out var start, out var end))
            return BadRequest(new { mensaje = "El año o mes no es válido." });

        var days = await _context.TurTurno.AsNoTracking()
            .Where(x => x.FechaApertura >= start && x.FechaApertura < end)
            .GroupBy(x => x.FechaApertura.Date)
            .Select(g => new
            {
                Fecha = g.Key,
                CantidadTurnos = g.Count(),
                TurnosAbiertos = g.Count(x => x.IdEstadoTurno == 1),
                CantidadBitacoras = g.Sum(x => x.TurBitacora.Count),
                CantidadVentas = g.Sum(x => x.VenVentas.Count(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null)),
                TotalVentas = g.Sum(x => x.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null).Sum(v => (int?)v.MontoTotal) ?? 0)
            }).OrderBy(x => x.Fecha).ToListAsync();

        var tipsByDay = await GetTipsByDayAsync(start, end);

        var dias = days.Select(d => new
        {
            d.Fecha,
            d.CantidadTurnos,
            d.TurnosAbiertos,
            d.CantidadBitacoras,
            d.CantidadVentas,
            d.TotalVentas,
            PropinaTotal = tipsByDay.TryGetValue(d.Fecha, out var propina) ? propina : 0
        });

        return Ok(new { year, month, Dias = dias });
    }

    [HttpGet("turn-records/day")]
    [Permission(Permissions.TurnRecordsView)]
    public async Task<IActionResult> GetTurnDay([FromQuery] DateTime date)
    {
        var start = date.Date;
        var end = start.AddDays(1);
        var turns = await _context.TurTurno.AsNoTracking()
            .Where(x => x.FechaApertura >= start && x.FechaApertura < end)
            .OrderBy(x => x.FechaApertura)
            .Select(x => new
            {
                x.IdTurno,
                x.IdUsuario,
                Usuario = x.IdUsuarioNavigation.NombreUsuario,
                Empleado = x.IdUsuarioNavigation.EmpEmpleados.Where(e => e.Activo)
                    .Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault(),
                x.FechaApertura,
                x.FechaCierre,
                x.IdEstadoTurno,
                Estado = x.IdEstadoTurnoNavigation.NombreEstadoTurno,
                x.DiferenciaTotal,
                CantidadVentas = x.VenVentas.Count(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null),
                TotalVentas = x.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.IdBitacora == null).Sum(v => (int?)v.MontoTotal) ?? 0,
                Bitacoras = x.TurBitacora.Select(b => new
                {
                    b.IdBitacora,
                    b.FechaCreacion,
                    b.Observaciones,
                    CantidadExtracciones = b.TurExtracciones.Count,
                    CantidadConsumos = b.TurProductosBitacora.Count(p => p.Activo)
                }).ToList()
            }).ToListAsync();

        var tipsByTurn = await GetTipsByTurnAsync(turns.Select(t => t.IdTurno).ToList());

        var turnos = turns.Select(t => new
        {
            t.IdTurno,
            t.IdUsuario,
            t.Usuario,
            t.Empleado,
            t.FechaApertura,
            t.FechaCierre,
            t.IdEstadoTurno,
            t.Estado,
            t.DiferenciaTotal,
            t.CantidadVentas,
            t.TotalVentas,
            PropinaTotal = tipsByTurn.TryGetValue(t.IdTurno, out var propina) ? propina : 0,
            t.Bitacoras
        });

        return Ok(new { Fecha = start, Turnos = turnos });
    }

    // Suma de propinas (Ven_Ordenes_Point.Monto_Propina) por día de apertura del turno,
    // considerando solo ventas terminadas.
    private async Task<Dictionary<DateTime, int>> GetTipsByDayAsync(DateTime start, DateTime end)
    {
        var tips = await _context.VenOrdenesPoint.AsNoTracking()
            .Where(o => o.IdVenta != null
                     && o.MontoPropina != null
                     && o.IdVentaNavigation!.IdEstadoVenta == EstadosVenta.Terminada
                     && o.IdVentaNavigation.IdTurnoNavigation.FechaApertura >= start
                     && o.IdVentaNavigation.IdTurnoNavigation.FechaApertura < end)
            .GroupBy(o => o.IdVentaNavigation!.IdTurnoNavigation.FechaApertura.Date)
            .Select(g => new { Fecha = g.Key, Propina = g.Sum(o => o.MontoPropina ?? 0) })
            .ToListAsync();

        return tips.ToDictionary(t => t.Fecha, t => t.Propina);
    }

    // Suma de propinas por turno para el conjunto de turnos indicado.
    private async Task<Dictionary<int, int>> GetTipsByTurnAsync(List<int> turnIds)
    {
        if (turnIds.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var tips = await _context.VenOrdenesPoint.AsNoTracking()
            .Where(o => o.IdVenta != null
                     && o.MontoPropina != null
                     && o.IdVentaNavigation!.IdEstadoVenta == EstadosVenta.Terminada
                     && turnIds.Contains(o.IdVentaNavigation.IdTurno))
            .GroupBy(o => o.IdVentaNavigation!.IdTurno)
            .Select(g => new { IdTurno = g.Key, Propina = g.Sum(o => o.MontoPropina ?? 0) })
            .ToListAsync();

        return tips.ToDictionary(t => t.IdTurno, t => t.Propina);
    }

    [HttpGet("turn-records/logbook/{idBitacora:int}")]
    [Permission(Permissions.TurnRecordsLogbookView + "|" + Permissions.OwnLogbookView)]
    public async Task<IActionResult> GetLogbookDetail(int idBitacora)
    {
        var query = _context.TurBitacora.AsNoTracking();
        if (!await _permissions.HasPermissionAsync(User.GetUserId(), Permissions.TurnRecordsLogbookView))
            query = query.Where(x => x.IdTurnoNavigation.IdUsuario == User.GetUserId());

        var logbook = await query
            .AsSplitQuery()
            .Where(x => x.IdBitacora == idBitacora)
            .Select(x => new
            {
                x.IdBitacora,
                x.IdTurno,
                x.FechaCreacion,
                x.Observaciones,
                x.IdTurnoNavigation.FechaApertura,
                x.IdTurnoNavigation.FechaCierre,
                Estado = x.IdTurnoNavigation.IdEstadoTurnoNavigation.NombreEstadoTurno,
                Usuario = x.IdTurnoNavigation.IdUsuarioNavigation.NombreUsuario,
                Empleado = x.IdTurnoNavigation.IdUsuarioNavigation.EmpEmpleados.Where(e => e.Activo)
                    .Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault(),
                Extracciones = x.TurExtracciones.OrderBy(e => e.IdExtraccion).Select(e => new
                {
                    e.IdExtraccion, e.Gramos, e.Segundos, e.Mililitros, e.Observaciones
                }).ToList(),
                ProductosConsumidos = x.TurProductosBitacora.OrderByDescending(p => p.FechaConsumo).Select(p => new
                {
                    p.IdProductosBitacora,
                    p.IdProducto,
                    p.IdProductoNavigation.NombreProducto,
                    p.Cantidad,
                    p.EsCortesia,
                    p.FechaConsumo,
                    p.Activo,
                    p.Observacion
                }).ToList()
            }).FirstOrDefaultAsync();

        return logbook == null
            ? NotFound(new { mensaje = "Bitácora no encontrada." })
            : Ok(logbook);
    }

    private static bool TryGetMonthRange(int year, int month, out DateTime start, out DateTime end)
    {
        start = default;
        end = default;
        if (year is < 2000 or > 2100 || month is < 1 or > 12) return false;
        start = new DateTime(year, month, 1);
        end = start.AddMonths(1);
        return true;
    }
}
