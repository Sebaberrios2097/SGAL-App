using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Infraestructura.Entities.Sp;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly SieteVidasContext _context;
        private readonly ISpSieteVidasContextProcedures _procedures;

        public AuthController(SieteVidasContext context, ISpSieteVidasContextProcedures procedures)
        {
            _context = context;
            _procedures = procedures;
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

            // Get Employee info
            var employee = await _context.EmpEmpleados
                .FirstOrDefaultAsync(e => e.IdUsuario == user.IdUsuario);

            // Get active roles
            var roles = await _context.EmpRolesXusuario
                .Where(rx => rx.IdUsuario == user.IdUsuario && rx.Activo)
                .Select(rx => rx.IdRolUsuarioNavigation.NombreRol)
                .ToListAsync();

            return Ok(new
            {
                IdUsuario = user.IdUsuario,
                NombreUsuario = user.NombreUsuario,
                CambioClave = result.Cambio_Clave,
                Empleado = employee != null ? new
                {
                    IdEmpleado = employee.IdEmpleado,
                    Nombres = employee.Nombres,
                    Apellido1 = employee.Apellido1,
                    Apellido2 = employee.Apellido2,
                    Correo = employee.Correo
                } : null,
                Roles = roles
            });
        }

        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PassNueva))
            {
                return BadRequest(new { Mensaje = "La nueva contraseña es requerida" });
            }

            var resultList = await _procedures.sp_Emp_CambiaClaveAsync(dto.IdUsuario, dto.PassActual, dto.PassNueva, dto.EsAdmin);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Resultado != 1)
            {
                return BadRequest(new { Mensaje = result?.Mensaje ?? "Error al cambiar la contraseña" });
            }

            return Ok(new { Mensaje = result.Mensaje });
        }
    }
}
