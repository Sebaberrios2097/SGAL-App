using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Services;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TurnController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public TurnController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet("active")]
        [Permission(Permissions.OwnTurnsView + "|" + Permissions.SalesOperate)]
        public async Task<IActionResult> GetActiveTurn([FromQuery] int idUsuario)
        {
            idUsuario = User.GetUserId();
            // Find any active turn in the system
            var activeTurn = await _context.TurTurno
                .Include(t => t.IdUsuarioNavigation)
                .FirstOrDefaultAsync(t => t.IdEstadoTurno == 1); // 1 = Abierto

            if (activeTurn == null)
            {
                return Ok(new
                {
                    HasActiveTurn = false,
                    BelongsToCurrentUser = false
                });
            }

            return Ok(new
            {
                HasActiveTurn = true,
                BelongsToCurrentUser = activeTurn.IdUsuario == idUsuario,
                ActiveTurn = new
                {
                    activeTurn.IdTurno,
                    activeTurn.IdUsuario,
                    NombreUsuario = activeTurn.IdUsuarioNavigation.NombreUsuario,
                    activeTurn.FechaApertura
                }
            });
        }

        [HttpGet("last")]
        [Permission(Permissions.OwnTurnsView)]
        public async Task<IActionResult> GetLastTurn([FromQuery] int idUsuario)
        {
            idUsuario = User.GetUserId();
            var lastTurn = await _context.TurTurno
                .Include(t => t.IdEstadoTurnoNavigation)
                .Where(t => t.IdUsuario == idUsuario)
                .OrderByDescending(t => t.FechaApertura)
                .FirstOrDefaultAsync();

            if (lastTurn == null)
            {
                return Ok(new { HasLastTurn = false });
            }

            var totalSales = await _context.VenVentas
                .Where(v => v.IdTurno == lastTurn.IdTurno)
                .SumAsync(v => (int?)v.MontoTotal) ?? 0;

            var salesCount = await _context.VenVentas
                .Where(v => v.IdTurno == lastTurn.IdTurno)
                .CountAsync();

            return Ok(new
            {
                HasLastTurn = true,
                TurnInfo = new
                {
                    lastTurn.IdTurno,
                    lastTurn.IdEstadoTurno,
                    EstadoNombre = lastTurn.IdEstadoTurnoNavigation.NombreEstadoTurno,
                    lastTurn.FechaApertura,
                    lastTurn.FechaCierre,
                    lastTurn.DiferenciaTotal,
                    lastTurn.ObservacionCierre,
                    TotalSales = totalSales,
                    SalesCount = salesCount
                }
            });
        }

        [HttpGet("history")]
        [Permission(Permissions.OwnTurnsView)]
        public async Task<IActionResult> GetHistory([FromQuery] int idUsuario)
        {
            idUsuario = User.GetUserId();
            if (idUsuario <= 0)
            {
                return BadRequest(new { mensaje = "El usuario es obligatorio." });
            }

            var turns = await _context.TurTurno
                .AsNoTracking()
                .Where(t => t.IdUsuario == idUsuario)
                .OrderByDescending(t => t.FechaApertura)
                .Select(t => new
                {
                    t.IdTurno,
                    t.IdEstadoTurno,
                    EstadoNombre = t.IdEstadoTurnoNavigation.NombreEstadoTurno,
                    t.FechaApertura,
                    t.FechaCierre,
                    t.DiferenciaTotal,
                    TotalSales = t.VenVentas.Sum(v => (int?)v.MontoTotal) ?? 0,
                    SalesCount = t.VenVentas.Count(),
                    ExtractionCount = t.TurBitacora.SelectMany(b => b.TurExtracciones).Count()
                })
                .ToListAsync();

            return Ok(turns);
        }

        [HttpGet("calendar")]
        [Permission(Permissions.OwnTurnsView)]
        public async Task<IActionResult> GetCalendar([FromQuery] int idUsuario, [FromQuery] int year, [FromQuery] int month)
        {
            idUsuario = User.GetUserId();
            if (idUsuario <= 0)
            {
                return BadRequest(new { mensaje = "El usuario es obligatorio." });
            }

            if (year is < 2000 or > 2100 || month is < 1 or > 12)
            {
                return BadRequest(new { mensaje = "El año o mes no es válido." });
            }

            var start = new DateTime(year, month, 1);
            var end = start.AddMonths(1);

            var days = await _context.TurTurno.AsNoTracking()
                .Where(x => x.IdUsuario == idUsuario && x.FechaApertura >= start && x.FechaApertura < end)
                .GroupBy(x => x.FechaApertura.Date)
                .Select(g => new
                {
                    Fecha = g.Key,
                    CantidadTurnos = g.Count(),
                    TurnosAbiertos = g.Count(x => x.IdEstadoTurno == 1),
                    CantidadBitacoras = g.Sum(x => x.TurBitacora.Count),
                    CantidadVentas = g.Sum(x => x.VenVentas.Count(v => v.IdEstadoVenta == EstadosVenta.Terminada)),
                    TotalVentas = g.Sum(x => x.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada).Sum(v => (int?)v.MontoTotal) ?? 0)
                })
                .OrderBy(x => x.Fecha)
                .ToListAsync();

            var tipsByDay = await GetTipsByDayAsync(idUsuario, start, end);

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

        [HttpGet("day")]
        [Permission(Permissions.OwnTurnsView)]
        public async Task<IActionResult> GetDay([FromQuery] int idUsuario, [FromQuery] DateTime date)
        {
            idUsuario = User.GetUserId();
            if (idUsuario <= 0)
            {
                return BadRequest(new { mensaje = "El usuario es obligatorio." });
            }

            var start = date.Date;
            var end = start.AddDays(1);

            var turns = await _context.TurTurno.AsNoTracking()
                .Where(x => x.IdUsuario == idUsuario && x.FechaApertura >= start && x.FechaApertura < end)
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
                    CantidadVentas = x.VenVentas.Count(v => v.IdEstadoVenta == EstadosVenta.Terminada),
                    TotalVentas = x.VenVentas.Where(v => v.IdEstadoVenta == EstadosVenta.Terminada).Sum(v => (int?)v.MontoTotal) ?? 0,
                    Bitacoras = x.TurBitacora.Select(b => new
                    {
                        b.IdBitacora,
                        b.FechaCreacion,
                        b.Observaciones,
                        CantidadExtracciones = b.TurExtracciones.Count,
                        CantidadConsumos = b.TurProductosBitacora.Count(p => p.Activo)
                    }).ToList()
                })
                .ToListAsync();

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
        // considerando solo ventas terminadas del usuario indicado.
        private async Task<Dictionary<DateTime, int>> GetTipsByDayAsync(int idUsuario, DateTime start, DateTime end)
        {
            var tips = await _context.VenOrdenesPoint.AsNoTracking()
                .Where(o => o.IdVenta != null
                         && o.MontoPropina != null
                         && o.IdVentaNavigation!.IdEstadoVenta == EstadosVenta.Terminada
                         && o.IdVentaNavigation.IdTurnoNavigation.IdUsuario == idUsuario
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

        [HttpGet("denominations")]
        [Permission(Permissions.TurnsOperate)]
        public async Task<IActionResult> GetDenominations()
        {
            var denominations = await _context.TurDenominaciones
                .OrderByDescending(d => d.Valor)
                .Select(d => new
                {
                    d.IdDenominacion,
                    d.Valor,
                    d.EsMoneda,
                    d.Descripcion
                })
                .ToListAsync();

            return Ok(denominations);
        }

        [HttpPost("open")]
        [Permission(Permissions.TurnsOpen)]
        public async Task<IActionResult> OpenTurn([FromBody] TurnOpenDto dto)
        {
            dto.IdUsuario = User.GetUserId();
            if (dto == null || dto.IdUsuario <= 0)
            {
                return BadRequest(new { Mensaje = "El usuario es obligatorio" });
            }

            var userExists = await _context.EmpUsuarios.AnyAsync(u => u.IdUsuario == dto.IdUsuario && u.Activo);
            if (!userExists)
            {
                return BadRequest(new { Mensaje = "Usuario no válido o inactivo" });
            }

            // Check if there is already any active turn in the system
            var anyActive = await _context.TurTurno.AnyAsync(t => t.IdEstadoTurno == 1);
            if (anyActive)
            {
                return BadRequest(new { Mensaje = "Ya existe un turno activo en la caja. Debe ser cerrado antes de iniciar uno nuevo." });
            }

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var turn = new TurTurno
                {
                    IdUsuario = dto.IdUsuario,
                    IdEstadoTurno = 1, // Abierto
                    FechaApertura = DateTime.Now
                };

                _context.TurTurno.Add(turn);
                await _context.SaveChangesAsync();

                _context.TurBitacora.Add(new TurBitacora
                {
                    IdTurno = turn.IdTurno,
                    FechaCreacion = DateTime.Now
                });

                if (dto.Desglose != null)
                {
                    foreach (var item in dto.Desglose.Where(item => item.Cantidad > 0))
                    {
                        _context.TurTurnoDesgloseEfectivo.Add(new TurTurnoDesgloseEfectivo
                        {
                            IdTurno = turn.IdTurno,
                            IdDenominacion = item.IdDenominacion,
                            IdTipoMovimiento = 1, // Apertura
                            Cantidad = item.Cantidad
                        });
                    }
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    turn.IdTurno,
                    turn.IdUsuario,
                    turn.FechaApertura,
                    turn.IdEstadoTurno
                });
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        [HttpGet("summary")]
        [Permission(Permissions.TurnsClose)]
        public async Task<IActionResult> GetTurnSummary([FromQuery] int idTurno)
        {
            var turn = await _context.TurTurno.FindAsync(idTurno);
            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado." });
            }
            if (turn.IdUsuario != User.GetUserId()) return Forbid();

            // 1. Calculate Expected Cash: Opening Cash + Cash Sales
            var openingCash = await (from e in _context.TurTurnoDesgloseEfectivo
                                     join d in _context.TurDenominaciones on e.IdDenominacion equals d.IdDenominacion
                                     where e.IdTurno == idTurno && e.IdTipoMovimiento == 1 // Apertura
                                     select e.Cantidad * d.Valor).SumAsync();

            // Solo cuentan las ventas terminadas: las pendientes de pago, las canceladas
            // por un cobro fallido y las anuladas no representan dinero en caja.
            var cashSales = await _context.VenMetodosPagoVenta
                .Where(mp => mp.IdVentaNavigation.IdTurno == idTurno && mp.IdMetodoPago == 1
                          && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                .SumAsync(mp => (int?)mp.Monto) ?? 0;

            var expectedCash = openingCash + cashSales;

            // 2. Calculate Card & Transfer Sales
            var expectedDebit = await _context.VenMetodosPagoVenta
                .Where(mp => mp.IdVentaNavigation.IdTurno == idTurno && mp.IdMetodoPago == 2
                          && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                .SumAsync(mp => (int?)mp.Monto) ?? 0;

            var expectedCredit = await _context.VenMetodosPagoVenta
                .Where(mp => mp.IdVentaNavigation.IdTurno == idTurno && mp.IdMetodoPago == 3
                          && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                .SumAsync(mp => (int?)mp.Monto) ?? 0;

            var expectedTransfer = await _context.VenMetodosPagoVenta
                .Where(mp => mp.IdVentaNavigation.IdTurno == idTurno && mp.IdMetodoPago == 4
                          && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                .SumAsync(mp => (int?)mp.Monto) ?? 0;

            var summary = new[]
            {
                new { idMetodoPago = 1, nombreMetodoPago = "Efectivo", montoEsperado = expectedCash },
                new { idMetodoPago = 2, nombreMetodoPago = "Débito", montoEsperado = expectedDebit },
                new { idMetodoPago = 3, nombreMetodoPago = "Crédito", montoEsperado = expectedCredit },
                new { idMetodoPago = 4, nombreMetodoPago = "Transferencia", montoEsperado = expectedTransfer }
            };

            return Ok(summary);
        }

        [HttpPost("close")]
        [Permission(Permissions.TurnsClose)]
        public async Task<IActionResult> CloseTurn([FromBody] TurnCloseDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { mensaje = "Datos del cierre no válidos." });
            }

            var turn = await _context.TurTurno.FindAsync(dto.IdTurno);
            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado." });
            }
            if (turn.IdUsuario != User.GetUserId()) return Forbid();

            if (turn.IdEstadoTurno != 1) // 1 = Abierto
            {
                return BadRequest(new { mensaje = "El turno ya se encuentra cerrado o inactivo." });
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // 1. Calculate Expected balances
                var openingCash = await (from e in _context.TurTurnoDesgloseEfectivo
                                         join d in _context.TurDenominaciones on e.IdDenominacion equals d.IdDenominacion
                                         where e.IdTurno == dto.IdTurno && e.IdTipoMovimiento == 1 // Apertura
                                         select e.Cantidad * d.Valor).SumAsync();

                // Igual que en el resumen: solo las ventas terminadas mueven dinero.
                var cashSales = await _context.VenMetodosPagoVenta
                    .Where(mp => mp.IdVentaNavigation.IdTurno == dto.IdTurno && mp.IdMetodoPago == 1
                              && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                    .SumAsync(mp => (int?)mp.Monto) ?? 0;

                var expectedCash = openingCash + cashSales;

                var expectedDebit = await _context.VenMetodosPagoVenta
                    .Where(mp => mp.IdVentaNavigation.IdTurno == dto.IdTurno && mp.IdMetodoPago == 2
                              && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                    .SumAsync(mp => (int?)mp.Monto) ?? 0;

                var expectedCredit = await _context.VenMetodosPagoVenta
                    .Where(mp => mp.IdVentaNavigation.IdTurno == dto.IdTurno && mp.IdMetodoPago == 3
                              && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                    .SumAsync(mp => (int?)mp.Monto) ?? 0;

                var expectedTransfer = await _context.VenMetodosPagoVenta
                    .Where(mp => mp.IdVentaNavigation.IdTurno == dto.IdTurno && mp.IdMetodoPago == 4
                              && mp.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
                    .SumAsync(mp => (int?)mp.Monto) ?? 0;

                // 2. Save close cash count to Tur_Turno_Desglose_Efectivo
                int realCash = 0;
                if (dto.DesgloseEfectivo != null)
                {
                    foreach (var item in dto.DesgloseEfectivo)
                    {
                        var denom = await _context.TurDenominaciones.FindAsync(item.IdDenominacion);
                        if (denom != null && item.Cantidad > 0)
                        {
                            realCash += item.Cantidad * denom.Valor;

                            var cashBreakdown = new TurTurnoDesgloseEfectivo
                            {
                                IdTurno = dto.IdTurno,
                                IdDenominacion = item.IdDenominacion,
                                IdTipoMovimiento = 2, // 2 = Cierre
                                Cantidad = item.Cantidad
                            };
                            _context.TurTurnoDesgloseEfectivo.Add(cashBreakdown);
                        }
                    }
                }

                // 3. Save expected vs real details to Tur_Turno_Desglose
                var realDebit = dto.DesgloseOtrosMetodos?.FirstOrDefault(m => m.IdMetodoPago == 2)?.MontoReal ?? 0;
                var realCredit = dto.DesgloseOtrosMetodos?.FirstOrDefault(m => m.IdMetodoPago == 3)?.MontoReal ?? 0;
                var realTransfer = dto.DesgloseOtrosMetodos?.FirstOrDefault(m => m.IdMetodoPago == 4)?.MontoReal ?? 0;

                var details = new[]
                {
                    new TurTurnoDesglose { IdTurno = dto.IdTurno, IdMetodoPago = 1, MontoEsperado = expectedCash, MontoReal = realCash },
                    new TurTurnoDesglose { IdTurno = dto.IdTurno, IdMetodoPago = 2, MontoEsperado = expectedDebit, MontoReal = realDebit },
                    new TurTurnoDesglose { IdTurno = dto.IdTurno, IdMetodoPago = 3, MontoEsperado = expectedCredit, MontoReal = realCredit },
                    new TurTurnoDesglose { IdTurno = dto.IdTurno, IdMetodoPago = 4, MontoEsperado = expectedTransfer, MontoReal = realTransfer }
                };

                _context.TurTurnoDesglose.AddRange(details);

                // 4. Calculate total discrepancy
                int diffCash = realCash - expectedCash;
                int diffDebit = realDebit - expectedDebit;
                int diffCredit = realCredit - expectedCredit;
                int diffTransfer = realTransfer - expectedTransfer;
                int totalDiff = diffCash + diffDebit + diffCredit + diffTransfer;

                // 5. Update Tur_Turno header
                turn.FechaCierre = DateTime.Now;
                turn.DiferenciaTotal = totalDiff;
                turn.ObservacionCierre = dto.ObservacionCierre;
                turn.IdEstadoTurno = (totalDiff == 0) ? 2 : 3; // 2 = Cerrado, 3 = Cerrado con Descuadre

                _context.Entry(turn).State = EntityState.Modified;

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    mensaje = "Turno cerrado con éxito",
                    idTurno = turn.IdTurno,
                    diferenciaTotal = totalDiff,
                    idEstadoTurno = turn.IdEstadoTurno
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "Error interno al procesar el cierre del turno.", detalle = ex.Message });
            }
        }
    }
}
