using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/logbook")]
    public class LogbookController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public LogbookController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet("turn/{idTurno:int}")]
        public async Task<IActionResult> GetByTurn(int idTurno, [FromQuery] int idUsuario)
        {
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
                .FirstOrDefaultAsync(b => b.IdTurno == idTurno);

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
                Extracciones = logbook?.TurExtracciones
                    .OrderBy(e => e.IdExtraccion)
                    .Select(e => new
                    {
                        e.IdExtraccion,
                        e.Gramos,
                        e.Segundos,
                        e.Mililitros,
                        e.Observaciones
                    }) ?? []
            });
        }

        [HttpPut("observation")]
        public async Task<IActionResult> UpdateObservation([FromBody] LogbookObservationUpdateDto dto)
        {
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
        public async Task<IActionResult> AddExtractions([FromBody] ExtractionBatchCreateDto dto)
        {
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

            var extractions = dto.Extracciones.Select(e => new TurExtracciones
            {
                IdBitacora = logbook.IdBitacora,
                Gramos = e.Gramos,
                Segundos = e.Segundos,
                Mililitros = e.Mililitros,
                Observaciones = string.IsNullOrWhiteSpace(e.Observaciones) ? null : e.Observaciones.Trim()
            }).ToList();

            _context.TurExtracciones.AddRange(extractions);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                mensaje = extractions.Count == 1 ? "Extracción registrada." : "Extracciones registradas.",
                cantidad = extractions.Count
            });
        }
    }
}
