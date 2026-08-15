using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Services;

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
        public async Task<IActionResult> GetActiveTurn([FromQuery] int idUsuario)
        {
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
        public async Task<IActionResult> GetLastTurn([FromQuery] int idUsuario)
        {
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

        [HttpGet("denominations")]
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
        public async Task<IActionResult> OpenTurn([FromBody] TurnOpenDto dto)
        {
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

            // Create Turno
            var turn = new TurTurno
            {
                IdUsuario = dto.IdUsuario,
                IdEstadoTurno = 1, // Abierto
                FechaApertura = DateTime.Now
            };

            _context.TurTurno.Add(turn);
            await _context.SaveChangesAsync(); // Generates IdTurno

            // Create breakdown (Desglose Efectivo)
            if (dto.Desglose != null && dto.Desglose.Any())
            {
                foreach (var item in dto.Desglose)
                {
                    if (item.Cantidad > 0)
                    {
                        var breakdown = new TurTurnoDesgloseEfectivo
                        {
                            IdTurno = turn.IdTurno,
                            IdDenominacion = item.IdDenominacion,
                            IdTipoMovimiento = 1, // Apertura
                            Cantidad = item.Cantidad
                        };
                        _context.TurTurnoDesgloseEfectivo.Add(breakdown);
                    }
                }
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                turn.IdTurno,
                turn.IdUsuario,
                turn.FechaApertura,
                turn.IdEstadoTurno
            });
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetTurnSummary([FromQuery] int idTurno)
        {
            var turn = await _context.TurTurno.FindAsync(idTurno);
            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado." });
            }

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
