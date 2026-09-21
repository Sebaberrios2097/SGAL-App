using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;
using SgalApp.Api.Services;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Controllers
{
    /// <summary>
    /// Gestión de máquinas POS y sus credenciales. Reservada al rol Desarrollador. Los
    /// secretos se guardan cifrados y nunca se devuelven al cliente.
    /// </summary>
    [ApiController]
    [Route("api/pos-machines")]
    public class PosMachineController : ControllerBase
    {
        private readonly SgalContext _context;
        private readonly IPermissionService _permissions;
        private readonly IPosCredentialProvider _credentials;
        private readonly IPointService _pointService;

        public PosMachineController(
            SgalContext context,
            IPermissionService permissions,
            IPosCredentialProvider credentials,
            IPointService pointService)
        {
            _context = context;
            _permissions = permissions;
            _credentials = credentials;
            _pointService = pointService;
        }

        private async Task<bool> IsDeveloperAsync() => await _permissions.IsDeveloperAsync(User.GetUserId());

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            if (!await IsDeveloperAsync()) return Forbid();

            var machines = await _context.IntMaquinasPos.AsNoTracking()
                .OrderBy(m => m.Proveedor).ThenBy(m => m.IdMaquina)
                .Select(m => new PosMachineDto
                {
                    IdMaquina = m.IdMaquina,
                    Proveedor = m.Proveedor,
                    Nombre = m.Nombre,
                    Activa = m.Activa,
                    TerminalId = m.TerminalId,
                    BaseUrl = m.BaseUrl,
                    PrintOnTerminal = m.PrintOnTerminal,
                    PayerCondition = m.PayerCondition,
                    ExpirationTime = m.ExpirationTime,
                    PermiteSimulacion = m.PermiteSimulacion,
                    AutoSimular = m.AutoSimular,
                    AccessTokenConfigurado = m.AccessTokenCifrado != null,
                    WebhookSecretConfigurado = m.WebhookSecretCifrado != null
                })
                .ToListAsync();

            return Ok(machines);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] PosMachineUpsertDto dto)
        {
            if (!await IsDeveloperAsync()) return Forbid();
            if (string.IsNullOrWhiteSpace(dto.Nombre)) return BadRequest(new { mensaje = "El nombre es obligatorio." });

            var machine = new IntMaquinaPos
            {
                Proveedor = string.IsNullOrWhiteSpace(dto.Proveedor) ? PosCredentialProvider.MercadoPago : dto.Proveedor.Trim().ToLowerInvariant(),
                FechaCreacion = DateTime.UtcNow
            };
            Apply(machine, dto);
            _context.IntMaquinasPos.Add(machine);
            await EnsureSingleActiveAsync(machine);
            await _context.SaveChangesAsync();

            return Ok(new { machine.IdMaquina });
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PosMachineUpsertDto dto)
        {
            if (!await IsDeveloperAsync()) return Forbid();

            var machine = await _context.IntMaquinasPos.FirstOrDefaultAsync(m => m.IdMaquina == id);
            if (machine == null) return NotFound(new { mensaje = "Máquina no encontrada." });
            if (string.IsNullOrWhiteSpace(dto.Nombre)) return BadRequest(new { mensaje = "El nombre es obligatorio." });

            Apply(machine, dto);
            await EnsureSingleActiveAsync(machine);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (!await IsDeveloperAsync()) return Forbid();

            var machine = await _context.IntMaquinasPos.FirstOrDefaultAsync(m => m.IdMaquina == id);
            if (machine == null) return NotFound(new { mensaje = "Máquina no encontrada." });

            _context.IntMaquinasPos.Remove(machine);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>Valida descifrado, token y terminal de la máquina activa sin exponer secretos.</summary>
        [HttpPost("test")]
        public async Task<IActionResult> TestConnection(CancellationToken cancellationToken)
        {
            if (!await IsDeveloperAsync()) return Forbid();

            try
            {
                var config = await _credentials.ResolveMercadoPagoAsync(cancellationToken);
                var terminals = await _pointService.GetTerminalsAsync(cancellationToken: cancellationToken);
                var terminal = terminals.FirstOrDefault(t =>
                    string.Equals(t.Id, config.TerminalId, StringComparison.OrdinalIgnoreCase));

                if (terminal == null)
                {
                    // El dispositivo virtual estándar no siempre forma parte del listado de
                    // terminales físicas de la cuenta. Mercado Pago permite usarlo directamente
                    // con credenciales de prueba y simular el estado de la orden.
                    if (config.AllowSimulation
                        && config.TerminalId.EndsWith("__SBX0000001", StringComparison.OrdinalIgnoreCase))
                    {
                        return Ok(new
                        {
                            mensaje = "Credenciales de prueba y terminal virtual configuradas.",
                            terminalId = config.TerminalId,
                            modoOperacion = "VIRTUAL"
                        });
                    }

                    var disponibles = terminals.Select(t => new
                    {
                        terminalId = t.Id,
                        modoOperacion = t.OperatingMode
                    }).ToList();
                    return BadRequest(new
                    {
                        mensaje = disponibles.Count == 0
                            ? $"Mercado Pago aceptó el Access Token, pero esa cuenta no devolvió terminales. " +
                              $"La terminal configurada es '{config.TerminalId}'. Verifique que el token y la terminal pertenezcan al mismo entorno y cuenta."
                            : $"Mercado Pago aceptó el Access Token, pero la terminal configurada '{config.TerminalId}' no pertenece a esa cuenta.",
                        terminalesDisponibles = disponibles
                    });
                }

                return Ok(new
                {
                    mensaje = "Conexión con Mercado Pago validada.",
                    terminalId = terminal.Id,
                    modoOperacion = terminal.OperatingMode
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensaje = ex.Message });
            }
            catch (PointApiException ex)
            {
                return BadRequest(new
                {
                    mensaje = ex.StatusCode == System.Net.HttpStatusCode.Unauthorized
                        ? "Mercado Pago rechazó el Access Token configurado."
                        : "No fue posible validar la conexión con Mercado Pago."
                });
            }
        }

        // Copia los valores no secretos y actualiza los secretos solo si llegan con contenido.
        private void Apply(IntMaquinaPos machine, PosMachineUpsertDto dto)
        {
            machine.Nombre = dto.Nombre.Trim();
            machine.Activa = dto.Activa;
            machine.TerminalId = Clean(dto.TerminalId);
            machine.BaseUrl = Clean(dto.BaseUrl);
            machine.PrintOnTerminal = Clean(dto.PrintOnTerminal);
            machine.PayerCondition = Clean(dto.PayerCondition);
            machine.ExpirationTime = Clean(dto.ExpirationTime);
            machine.PermiteSimulacion = dto.PermiteSimulacion;
            machine.AutoSimular = dto.AutoSimular;
            machine.FechaActualizacion = DateTime.UtcNow;

            if (!string.IsNullOrWhiteSpace(dto.AccessToken))
                machine.AccessTokenCifrado = _credentials.Protect(dto.AccessToken.Trim());
            if (!string.IsNullOrWhiteSpace(dto.WebhookSecret))
                machine.WebhookSecretCifrado = _credentials.Protect(dto.WebhookSecret.Trim());
        }

        // Solo una máquina activa por proveedor: al activar una, se desactivan las demás del mismo proveedor.
        private async Task EnsureSingleActiveAsync(IntMaquinaPos machine)
        {
            if (!machine.Activa) return;
            var otras = await _context.IntMaquinasPos
                .Where(m => m.Proveedor == machine.Proveedor && m.Activa && m.IdMaquina != machine.IdMaquina)
                .ToListAsync();
            foreach (var otra in otras) otra.Activa = false;
        }

        private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
