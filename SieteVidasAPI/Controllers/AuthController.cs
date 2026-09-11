using Infraestructura.Context;
using Infraestructura.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly SieteVidasContext _context;
        private readonly ISpSieteVidasContextProcedures _procedures;
        private readonly IPermissionService _permissions;

        public AuthController(SieteVidasContext context, ISpSieteVidasContextProcedures procedures, IPermissionService permissions)
        {
            _context = context;
            _procedures = procedures;
            _permissions = permissions;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.NombreUsuario) || string.IsNullOrWhiteSpace(dto.Pass))
            {
                return BadRequest(new { Mensaje = "Usuario y contraseña son requeridos" });
            }

            var user = await _context.EmpUsuarios
                .FirstOrDefaultAsync(u => u.NombreUsuario.ToLower() == dto.NombreUsuario.ToLower() && u.Activo);

            if (user == null)
            {
                return Unauthorized(new { Mensaje = "Usuario no encontrado o inactivo" });
            }

            var resultList = await _procedures.sp_Emp_ValidaAccesoAsync(user.IdUsuario, dto.Pass);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Acceso_Valido != true)
            {
                return Unauthorized(new { Mensaje = result?.Mensaje ?? "Credenciales inválidas" });
            }

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.IdUsuario.ToString()),
                new Claim(ClaimTypes.Name, user.NombreUsuario),
                new Claim("must_change_password", (result.Cambio_Clave == true).ToString().ToLowerInvariant())
            };
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));

            return Ok(await BuildSessionAsync(user.IdUsuario, result.Cambio_Clave == true));
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var id = User.GetUserId();
            var active = await _context.EmpUsuarios.AnyAsync(x => x.IdUsuario == id && x.Activo);
            if (!active)
            {
                await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                return Unauthorized(new { Mensaje = "La cuenta no está activa." });
            }
            return Ok(await BuildSessionAsync(id, User.FindFirstValue("must_change_password") == "true"));
        }

        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return NoContent();
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PassNueva))
            {
                return BadRequest(new { Mensaje = "La nueva contraseña es requerida" });
            }
            if (dto.PassNueva.Length < 4)
            {
                return BadRequest(new { Mensaje = "La nueva contraseña debe tener al menos 4 caracteres" });
            }

            var currentUserId = User.GetUserId();
            var isOwnChange = dto.IdUsuario == currentUserId;
            var canResetPasswords = await _permissions.HasPermissionAsync(currentUserId, Permissions.UsersPasswordReset);
            var isAdministrativeReset = dto.EsAdmin && canResetPasswords;
            if (!isOwnChange && !canResetPasswords)
                return Forbid();

            var targetUserId = isOwnChange ? currentUserId : dto.IdUsuario;
            var resultList = await _procedures.sp_Emp_CambiaClaveAsync(targetUserId, dto.PassActual, dto.PassNueva, isAdministrativeReset || !isOwnChange);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Resultado != 1)
            {
                return BadRequest(new { Mensaje = result?.Mensaje ?? "Error al cambiar la contraseña" });
            }

            if (isOwnChange && !isAdministrativeReset)
            {
                var name = User.FindFirstValue(ClaimTypes.Name) ?? string.Empty;
                var claims = new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, currentUserId.ToString()),
                    new Claim(ClaimTypes.Name, name),
                    new Claim("must_change_password", "false")
                };
                await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                    new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
            }

            return Ok(new { Mensaje = result.Mensaje });
        }

        private async Task<object> BuildSessionAsync(int userId, bool cambioClave)
        {
            var user = await _context.EmpUsuarios.AsNoTracking().FirstAsync(x => x.IdUsuario == userId);
            var employee = await _context.EmpEmpleados.AsNoTracking()
                .FirstOrDefaultAsync(e => e.IdUsuario == userId && e.Activo);
            var roles = await _context.EmpRolesXusuario.AsNoTracking()
                .Where(rx => rx.IdUsuario == userId && rx.Activo)
                .Select(rx => rx.IdRolUsuarioNavigation.NombreRol).ToListAsync();
            var permissions = await _permissions.GetEffectivePermissionsAsync(userId);

            return new
            {
                user.IdUsuario,
                user.NombreUsuario,
                CambioClave = cambioClave,
                Empleado = employee == null ? null : new
                {
                    employee.IdEmpleado, employee.Nombres, employee.Alias, employee.Apellido1,
                    employee.Apellido2, employee.Correo
                },
                Roles = roles,
                Permissions = permissions
            };
        }
    }
}
