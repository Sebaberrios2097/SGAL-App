using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using System.Data;
using SgalApp.Api.Security;
using SgalApp.Api.Services;

namespace SgalApp.Api.Controllers
{
    [ApiController]
    [Route("api/logbook")]
    public class LogbookController : ControllerBase
    {
        private readonly SgalContext _context;

        public LogbookController(SgalContext context)
        {
            _context = context;
        }

        [HttpGet("turn/{idTurno:int}")]
        [Permission(Permissions.OwnLogbookView)]
        public async Task<IActionResult> GetByTurn(int idTurno, [FromQuery] int idUsuario)
        {
            idUsuario = User.GetUserId();
            var turn = await _context.TurTurno
                .AsNoTracking()
                .Include(t => t.IdEstadoTurnoNavigation)
                .FirstOrDefaultAsync(t => t.IdTurno == idTurno && t.IdUsuario == idUsuario);

            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado para el usuario." });
            }

            var logbook = await _context.TurBitacora
                .AsNoTracking()
                .Include(b => b.TurExtracciones)
                    .ThenInclude(e => e.IdMateriaPrimaNavigation)
                .FirstOrDefaultAsync(b => b.IdTurno == idTurno);

            var dayStart = DateTime.Today;
            var dayEnd = dayStart.AddDays(1);

            // Cortesías consumidas hoy por el usuario: líneas de cortesía de sus ventas de consumo.
            var courtesyConsumedToday = await _context.VenDetalleVenta.AsNoTracking()
                .Where(d => d.EsCortesia
                    && d.IdVentaNavigation.IdBitacora != null
                    && d.IdVentaNavigation.IdTurnoNavigation.IdUsuario == idUsuario
                    && d.IdVentaNavigation.FechaVenta >= dayStart && d.IdVentaNavigation.FechaVenta < dayEnd)
                .SumAsync(d => (int?)d.Cantidad) ?? 0;
            var courtesyLimit = await _context.InvConfiguracionCortesia
                .Where(x => x.IdConfiguracion == 1)
                .Select(x => (int?)x.LimiteDiarioGlobal)
                .FirstOrDefaultAsync() ?? 2;

            var courtesyProducts = await _context.InvProductosCortesia.AsNoTracking()
                .Where(x => x.Activo == 1 && x.IdProductoNavigation.Activo)
                .OrderBy(x => x.IdProductoNavigation.NombreProducto)
                .Select(x => new
                {
                    x.IdProducto,
                    x.IdProductoNavigation.NombreProducto,
                    x.CantidadDiaria,
                    ConsumidoHoy = _context.VenDetalleVenta
                        .Where(d => d.EsCortesia && d.IdProducto == x.IdProducto
                            && d.IdVentaNavigation.IdBitacora != null
                            && d.IdVentaNavigation.IdTurnoNavigation.IdUsuario == idUsuario
                            && d.IdVentaNavigation.FechaVenta >= dayStart && d.IdVentaNavigation.FechaVenta < dayEnd)
                        .Sum(d => (int?)d.Cantidad) ?? 0
                }).ToListAsync();

            // Consumos del turno: ventas de consumo asociadas a la bitácora, con su detalle.
            var consumos = logbook == null
                ? []
                : await _context.VenVentas.AsNoTracking()
                    .Where(v => v.IdBitacora == logbook.IdBitacora && v.IdEstadoVenta != EstadosVenta.Cancelada)
                    .OrderByDescending(v => v.FechaVenta)
                    .Select(v => new
                    {
                        v.IdVenta,
                        v.FechaVenta,
                        v.PagadoPorEmpleado,
                        MontoAdeudado = v.VenDetalleVenta.Where(d => !d.EsCortesia).Sum(d => (int?)d.Subtotal) ?? 0,
                        MontoCortesia = v.VenDetalleVenta.Where(d => d.EsCortesia).Sum(d => (int?)d.Subtotal) ?? 0,
                        Items = v.VenDetalleVenta.Select(d => new
                        {
                            d.IdProducto,
                            d.IdProductoNavigation.NombreProducto,
                            d.Cantidad,
                            d.Subtotal,
                            d.EsCortesia,
                            Extras = d.VenDetalleVentaIngrediente.Select(x => new { Nombre = x.IdMateriaPrimaNavigation.NombreMaterial, x.Precio })
                        }).ToList()
                    }).ToListAsync();

            var calibracion = await GetCalibrationMaterialsAsync();

            return Ok(new
            {
                turn.IdTurno,
                turn.IdEstadoTurno,
                EstadoNombre = turn.IdEstadoTurnoNavigation.NombreEstadoTurno,
                turn.FechaApertura,
                turn.FechaCierre,
                EsEditable = turn.IdEstadoTurno == 1,
                IdBitacora = logbook?.IdBitacora,
                FechaCreacion = logbook?.FechaCreacion,
                Observaciones = logbook?.Observaciones,
                Consumos = consumos,
                Cortesia = new
                {
                    LimiteDiarioGlobal = courtesyLimit,
                    ConsumidoHoy = courtesyConsumedToday,
                    RestanteHoy = Math.Max(0, courtesyLimit - courtesyConsumedToday),
                    Productos = courtesyProducts
                },
                Extracciones = logbook?.TurExtracciones
                    .OrderBy(e => e.IdExtraccion)
                    .Select(e => new
                    {
                        e.IdExtraccion,
                        e.Gramos,
                        e.Segundos,
                        e.Mililitros,
                        e.Observaciones,
                        e.IdMateriaPrima,
                        Materia = e.IdMateriaPrimaNavigation != null ? e.IdMateriaPrimaNavigation.NombreMaterial : null,
                        e.CantidadDescontada
                    }) ?? [],
                Calibracion = new
                {
                    IdMateriaDefault = calibracion.IdMateriaDefault,
                    Materias = calibracion.Materias
                }
            });
        }

        // Materias primas (café) que el POS puede descontar por calibración: el café marcado
        // como calibrable y sus pares de la misma categoría, todos controlados en inventario.
        private async Task<(int? IdMateriaDefault, object Materias)> GetCalibrationMaterialsAsync()
        {
            var calibrable = await _context.InvMateriaPrima.AsNoTracking()
                .Where(m => m.EsCafeCalibrable)
                .Select(m => new { m.IdMateriaPrima, m.IdCategoriaMateria })
                .FirstOrDefaultAsync();

            var query = _context.InvMateriaPrima.AsNoTracking().Where(m => !m.NoDescuentaInventario);
            if (calibrable != null)
                query = query.Where(m => m.IdCategoriaMateria == calibrable.IdCategoriaMateria);

            var materias = await query
                .OrderByDescending(m => m.EsCafeCalibrable).ThenBy(m => m.NombreMaterial)
                .Select(m => new
                {
                    m.IdMateriaPrima,
                    m.NombreMaterial,
                    Abreviacion = m.IdUnidadMedidaNavigation.Abreviacion,
                    m.EsCafeCalibrable
                }).ToListAsync();

            return (calibrable?.IdMateriaPrima, materias);
        }

        /// <summary>
        /// Gramos de la última calibración (extracción) del turno, o null si aún no hay ninguna.
        /// Lo usa el POS para avisar antes de vender preparaciones que dependen de la calibración.
        /// </summary>
        [HttpGet("turn/{idTurno:int}/calibration")]
        [Permission(Permissions.OwnLogbookView + "|" + Permissions.SalesOperate)]
        public async Task<IActionResult> GetLastCalibration(int idTurno)
        {
            var idUsuario = User.GetUserId();
            if (!await _context.TurTurno.AnyAsync(t => t.IdTurno == idTurno && t.IdUsuario == idUsuario))
                return NotFound(new { mensaje = "Turno no encontrado para el usuario." });

            var gramos = await _context.TurExtracciones
                .Where(e => e.IdBitacoraNavigation.IdTurno == idTurno)
                .OrderByDescending(e => e.IdExtraccion)
                .Select(e => (double?)e.Gramos)
                .FirstOrDefaultAsync();

            return Ok(new { TieneCalibracion = gramos.HasValue, Gramos = gramos });
        }


        [HttpPut("observation")]
        [Permission(Permissions.LogbookObservationEdit)]
        public async Task<IActionResult> UpdateObservation([FromBody] LogbookObservationUpdateDto dto)
        {
            dto.IdUsuario = User.GetUserId();
            if (dto.IdUsuario <= 0 || dto.IdTurno <= 0)
            {
                return BadRequest(new { mensaje = "El usuario y el turno son obligatorios." });
            }

            if (dto.Observaciones?.Length > 1000)
            {
                return BadRequest(new { mensaje = "La observación no puede superar los 1000 caracteres." });
            }

            var turn = await _context.TurTurno
                .FirstOrDefaultAsync(t => t.IdTurno == dto.IdTurno && t.IdUsuario == dto.IdUsuario);

            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado para el usuario." });
            }

            if (turn.IdEstadoTurno != 1)
            {
                return Conflict(new { mensaje = "La bitácora de un turno finalizado no puede ser modificada." });
            }

            var logbook = await _context.TurBitacora.FirstOrDefaultAsync(b => b.IdTurno == dto.IdTurno);
            if (logbook == null)
            {
                logbook = new TurBitacora
                {
                    IdTurno = dto.IdTurno,
                    FechaCreacion = DateTime.Now
                };
                _context.TurBitacora.Add(logbook);
            }

            logbook.Observaciones = string.IsNullOrWhiteSpace(dto.Observaciones)
                ? null
                : dto.Observaciones.Trim();

            await _context.SaveChangesAsync();
            return Ok(new { mensaje = "Observación de la bitácora guardada." });
        }

        [HttpPost("extractions")]
        [Permission(Permissions.LogbookExtractionsCreate)]
        public async Task<IActionResult> AddExtractions([FromBody] ExtractionBatchCreateDto dto)
        {
            dto.IdUsuario = User.GetUserId();
            if (dto.IdUsuario <= 0 || dto.IdTurno <= 0)
            {
                return BadRequest(new { mensaje = "El usuario y el turno son obligatorios." });
            }

            if (dto.Extracciones.Count == 0)
            {
                return BadRequest(new { mensaje = "Debe registrar al menos una extracción." });
            }

            if (dto.Extracciones.Any(e => e.Gramos <= 0 || e.Segundos <= 0 || e.Mililitros <= 0))
            {
                return BadRequest(new { mensaje = "Gramos, segundos y mililitros deben ser mayores que cero." });
            }

            if (dto.Extracciones.Any(e => e.Observaciones?.Length > 300))
            {
                return BadRequest(new { mensaje = "Las observaciones no pueden superar los 300 caracteres." });
            }

            var turn = await _context.TurTurno
                .FirstOrDefaultAsync(t => t.IdTurno == dto.IdTurno && t.IdUsuario == dto.IdUsuario);

            if (turn == null)
            {
                return NotFound(new { mensaje = "Turno no encontrado para el usuario." });
            }

            if (turn.IdEstadoTurno != 1)
            {
                return Conflict(new { mensaje = "La bitácora de un turno finalizado no puede ser modificada." });
            }

            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

            var logbook = await _context.TurBitacora.FirstOrDefaultAsync(b => b.IdTurno == dto.IdTurno);
            if (logbook == null)
            {
                logbook = new TurBitacora
                {
                    IdTurno = dto.IdTurno,
                    FechaCreacion = DateTime.Now
                };
                _context.TurBitacora.Add(logbook);
                await _context.SaveChangesAsync();
            }

            // Café que descuenta stock para toda la tanda: el indicado o, por defecto, el calibrable.
            var idMateria = dto.IdMateriaPrima
                ?? await _context.InvMateriaPrima.Where(m => m.EsCafeCalibrable)
                    .Select(m => (int?)m.IdMateriaPrima).FirstOrDefaultAsync();

            InvMateriaPrima? materia = null;
            if (idMateria.HasValue)
            {
                materia = await _context.InvMateriaPrima
                    .Include(m => m.IdUnidadMedidaNavigation)
                    .FirstOrDefaultAsync(m => m.IdMateriaPrima == idMateria.Value);
                if (materia == null)
                    return BadRequest(new { mensaje = "La materia prima seleccionada no existe." });
            }

            // Solo se descuenta stock si el café está controlado en inventario.
            var descuentaStock = materia != null && !materia.NoDescuentaInventario;

            // Los gramos de la extracción se convierten a la unidad de inventario del café,
            // igual que en las ventas: gramos * factor(unidad base) / factor(unidad del café).
            decimal gramFactor = 1m;
            if (descuentaStock)
            {
                gramFactor = await _context.InvUnidadesMedida
                    .Where(u => u.TipoMagnitud == materia!.IdUnidadMedidaNavigation.TipoMagnitud && u.EsUnidadBase)
                    .Select(u => (decimal?)u.FactorConversionBase).FirstOrDefaultAsync() ?? 1m;
            }

            var extractions = new List<TurExtracciones>();
            decimal totalDescuento = 0;
            foreach (var e in dto.Extracciones)
            {
                var extraction = new TurExtracciones
                {
                    IdBitacora = logbook.IdBitacora,
                    IdMateriaPrima = materia?.IdMateriaPrima,
                    Gramos = e.Gramos,
                    Segundos = e.Segundos,
                    Mililitros = e.Mililitros,
                    Observaciones = string.IsNullOrWhiteSpace(e.Observaciones) ? null : e.Observaciones.Trim()
                };

                if (descuentaStock)
                {
                    var required = decimal.Round(
                        (decimal)e.Gramos * gramFactor / materia!.IdUnidadMedidaNavigation.FactorConversionBase,
                        3, MidpointRounding.AwayFromZero);
                    if (required <= 0)
                        return Conflict(new { mensaje = $"Los gramos de la extracción son demasiado pequeños para la precisión del inventario de {materia.NombreMaterial}." });
                    extraction.CantidadDescontada = required;
                    totalDescuento += required;
                }

                extractions.Add(extraction);
            }

            if (descuentaStock && totalDescuento > 0)
            {
                if (materia!.Cantidad < totalDescuento)
                    return Conflict(new { mensaje = $"Stock insuficiente de {materia.NombreMaterial}. Se requieren {totalDescuento} {materia.IdUnidadMedidaNavigation.Abreviacion} para las extracciones." });
                materia.Cantidad -= totalDescuento;
            }

            _context.TurExtracciones.AddRange(extractions);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                mensaje = extractions.Count == 1 ? "Extracción registrada." : "Extracciones registradas.",
                cantidad = extractions.Count,
                materia = materia == null ? null : new { materia.IdMateriaPrima, materia.NombreMaterial },
                gramosDescontados = totalDescuento
            });
        }

        /// <summary>
        /// Última extracción registrada en el turno anterior (el más reciente distinto al actual).
        /// Permite al segundo turno del día reutilizar la calibración del primero sin recalibrar.
        /// </summary>
        [HttpGet("turn/{idTurno:int}/previous-extraction")]
        [Permission(Permissions.LogbookExtractionsCreate + "|" + Permissions.OwnLogbookView)]
        public async Task<IActionResult> GetPreviousTurnExtraction(int idTurno)
        {
            var idUsuario = User.GetUserId();
            if (!await _context.TurTurno.AnyAsync(t => t.IdTurno == idTurno && t.IdUsuario == idUsuario))
                return NotFound(new { mensaje = "Turno no encontrado para el usuario." });

            var previous = await _context.TurExtracciones.AsNoTracking()
                .Where(e => e.IdBitacoraNavigation.IdTurno < idTurno)
                .OrderByDescending(e => e.IdBitacoraNavigation.IdTurno)
                .ThenByDescending(e => e.IdExtraccion)
                .Select(e => new
                {
                    e.IdExtraccion,
                    e.Gramos,
                    e.Segundos,
                    e.Mililitros,
                    e.Observaciones,
                    e.IdMateriaPrima,
                    Materia = e.IdMateriaPrimaNavigation != null ? e.IdMateriaPrimaNavigation.NombreMaterial : null,
                    IdTurnoOrigen = e.IdBitacoraNavigation.IdTurno,
                    FechaTurnoOrigen = e.IdBitacoraNavigation.IdTurnoNavigation.FechaApertura
                })
                .FirstOrDefaultAsync();

            return Ok(new { tieneExtraccion = previous != null, extraccion = previous });
        }

        /// <summary>
        /// Elimina una extracción del turno abierto del usuario y repone al inventario el café que
        /// había descontado (por si se registró con un error).
        /// </summary>
        [HttpDelete("extractions/{id:int}")]
        [Permission(Permissions.LogbookExtractionsCreate)]
        public async Task<IActionResult> DeleteExtraction(int id)
        {
            var idUsuario = User.GetUserId();
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

            var extraction = await _context.TurExtracciones
                .Include(e => e.IdBitacoraNavigation).ThenInclude(b => b.IdTurnoNavigation)
                .Include(e => e.IdMateriaPrimaNavigation)
                .FirstOrDefaultAsync(e => e.IdExtraccion == id);

            if (extraction == null || extraction.IdBitacoraNavigation.IdTurnoNavigation.IdUsuario != idUsuario)
                return NotFound(new { mensaje = "Extracción no encontrada para el usuario." });
            if (extraction.IdBitacoraNavigation.IdTurnoNavigation.IdEstadoTurno != 1)
                return Conflict(new { mensaje = "No se puede modificar la bitácora de un turno finalizado." });

            // Repone el café descontado por la extracción.
            if (extraction.CantidadDescontada > 0 && extraction.IdMateriaPrimaNavigation != null)
                extraction.IdMateriaPrimaNavigation.Cantidad += extraction.CantidadDescontada;

            _context.TurExtracciones.Remove(extraction);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Extracción eliminada y café repuesto." });
        }
    }
}
