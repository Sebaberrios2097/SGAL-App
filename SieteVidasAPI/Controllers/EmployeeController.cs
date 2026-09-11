using Infraestructura.Context;
using Infraestructura.Data;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EmployeeController : ControllerBase
    {
        private readonly SieteVidasContext _context;
        private readonly ISpSieteVidasContextProcedures _procedures;

        public EmployeeController(SieteVidasContext context, ISpSieteVidasContextProcedures procedures)
        {
            _context = context;
            _procedures = procedures;
        }

        [HttpGet]
        [Permission(Permissions.UsersView)]
        public async Task<IActionResult> GetEmployees()
        {
            var employees = await _context.EmpEmpleados
                .Include(e => e.IdUsuarioNavigation)
                    .ThenInclude(u => u!.EmpRolesXusuario)
                        .ThenInclude(rx => rx.IdRolUsuarioNavigation)
                .OrderByDescending(e => e.FechaIngreso)
                .Select(e => new
                {
                    e.IdEmpleado,
                    e.Rut,
                    e.Dv,
                    e.Nombres,
                    e.Alias,
                    e.Apellido1,
                    e.Apellido2,
                    e.NumeroTelefono,
                    e.Correo,
                    e.FechaIngreso,
                    e.FechaSalida,
                    e.Activo,
                    Usuario = e.IdUsuarioNavigation != null ? new
                    {
                        e.IdUsuarioNavigation.IdUsuario,
                        e.IdUsuarioNavigation.NombreUsuario,
                        e.IdUsuarioNavigation.Activo,
                        e.IdUsuarioNavigation.FechaCreacion,
                        Roles = e.IdUsuarioNavigation.EmpRolesXusuario
                            .Where(rx => rx.Activo)
                            .Select(rx => new
                            {
                                rx.IdRolUsuario,
                                rx.IdRolUsuarioNavigation.NombreRol
                            })
                            .ToList()
                    } : null
                })
                .ToListAsync();

            return Ok(employees);
        }

        [HttpGet("{id:int}")]
        [Permission(Permissions.UsersView)]
        public async Task<IActionResult> GetEmployee(int id)
        {
            var employee = await _context.EmpEmpleados
                .AsNoTracking()
                .Where(e => e.IdEmpleado == id)
                .Select(e => new
                {
                    e.IdEmpleado,
                    e.Rut,
                    e.Dv,
                    e.Nombres,
                    e.Alias,
                    e.Apellido1,
                    e.Apellido2,
                    e.NumeroTelefono,
                    e.Correo,
                    e.FechaIngreso,
                    e.FechaSalida,
                    e.Activo,
                    Usuario = e.IdUsuarioNavigation == null ? null : new
                    {
                        e.IdUsuarioNavigation.IdUsuario,
                        e.IdUsuarioNavigation.NombreUsuario,
                        e.IdUsuarioNavigation.Activo,
                        e.IdUsuarioNavigation.FechaCreacion
                    }
                })
                .FirstOrDefaultAsync();

            return employee == null
                ? NotFound(new { Mensaje = "Empleado no encontrado" })
                : Ok(employee);
        }

        [HttpPost]
        [Permission(Permissions.EmployeesCreate)]
        public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeDto dto)
        {
            if (dto.Rut <= 0 || string.IsNullOrWhiteSpace(dto.Dv) || string.IsNullOrWhiteSpace(dto.Nombres) || string.IsNullOrWhiteSpace(dto.Apellido1))
            {
                return BadRequest(new { Mensaje = "Rut, Dv, Nombres y Apellido Paterno son obligatorios" });
            }

            // Check if Rut already exists and is active
            var existing = await _context.EmpEmpleados
                .FirstOrDefaultAsync(e => e.Rut == dto.Rut && e.Activo);

            if (existing != null)
            {
                return BadRequest(new { Mensaje = $"Ya existe un empleado activo con el RUT {dto.Rut}" });
            }

            var employee = new EmpEmpleados
            {
                Rut = dto.Rut,
                Dv = dto.Dv.ToUpper(),
                Nombres = dto.Nombres,
                Alias = string.IsNullOrWhiteSpace(dto.Alias) ? null : dto.Alias.Trim(),
                Apellido1 = dto.Apellido1,
                Apellido2 = dto.Apellido2,
                NumeroTelefono = dto.NumeroTelefono,
                Correo = dto.Correo,
                FechaIngreso = DateOnly.FromDateTime(DateTime.Now),
                Activo = true
            };

            _context.EmpEmpleados.Add(employee);
            await _context.SaveChangesAsync();

            return Ok(employee);
        }

        [HttpPut("{id:int}")]
        [Permission(Permissions.EmployeesEdit)]
        public async Task<IActionResult> UpdateEmployee(int id, [FromBody] UpdateEmployeeDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Nombres) || string.IsNullOrWhiteSpace(dto.Apellido1))
                return BadRequest(new { Mensaje = "Nombres y apellido paterno son obligatorios" });
            if (dto.Nombres.Trim().Length > 100 || dto.Apellido1.Trim().Length > 50 ||
                (!string.IsNullOrWhiteSpace(dto.Alias) && dto.Alias.Trim().Length > 50) ||
                (!string.IsNullOrWhiteSpace(dto.Apellido2) && dto.Apellido2.Trim().Length > 50) ||
                (!string.IsNullOrWhiteSpace(dto.Correo) && dto.Correo.Trim().Length > 150))
                return BadRequest(new { Mensaje = "Uno o más datos del empleado superan el largo permitido" });

            var employee = await _context.EmpEmpleados.FindAsync(id);
            if (employee == null)
                return NotFound(new { Mensaje = "Empleado no encontrado" });

            employee.Nombres = dto.Nombres.Trim();
            employee.Alias = string.IsNullOrWhiteSpace(dto.Alias) ? null : dto.Alias.Trim();
            employee.Apellido1 = dto.Apellido1.Trim();
            employee.Apellido2 = string.IsNullOrWhiteSpace(dto.Apellido2) ? null : dto.Apellido2.Trim();
            employee.NumeroTelefono = dto.NumeroTelefono;
            employee.Correo = string.IsNullOrWhiteSpace(dto.Correo) ? null : dto.Correo.Trim();

            await _context.SaveChangesAsync();
            return Ok(new { Mensaje = "Datos del empleado actualizados" });
        }

        [HttpPut("{id:int}/user")]
        [Permission(Permissions.AccountsEdit)]
        public async Task<IActionResult> UpdateUserAccount(int id, [FromBody] UpdateUserAccountDto dto)
        {
            var userName = dto.NombreUsuario?.Trim();
            if (string.IsNullOrWhiteSpace(userName))
                return BadRequest(new { Mensaje = "El nombre de usuario es obligatorio" });
            if (userName.Length > 50)
                return BadRequest(new { Mensaje = "El nombre de usuario no puede superar los 50 caracteres" });

            var employee = await _context.EmpEmpleados
                .Include(e => e.IdUsuarioNavigation)
                .FirstOrDefaultAsync(e => e.IdEmpleado == id);
            if (employee == null)
                return NotFound(new { Mensaje = "Empleado no encontrado" });
            if (employee.IdUsuarioNavigation == null)
                return BadRequest(new { Mensaje = "El empleado no tiene una cuenta de usuario" });

            var normalizedName = userName.ToLower();
            var duplicate = await _context.EmpUsuarios.AnyAsync(u =>
                u.IdUsuario != employee.IdUsuario && u.NombreUsuario.ToLower() == normalizedName);
            if (duplicate)
                return BadRequest(new { Mensaje = "El nombre de usuario ya está en uso" });

            employee.IdUsuarioNavigation.NombreUsuario = userName;
            await _context.SaveChangesAsync();
            return Ok(new { Mensaje = "Cuenta de usuario actualizada", NombreUsuario = userName });
        }

        [HttpPost("{rut}/create-user")]
        [Permission(Permissions.AccountsCreate)]
        public async Task<IActionResult> CreateUserForEmployee(int rut)
        {
            var employee = await _context.EmpEmpleados.FirstOrDefaultAsync(e => e.Rut == rut && e.Activo);
            if (employee == null)
            {
                return NotFound(new { Mensaje = "Empleado no encontrado o inactivo" });
            }

            if (employee.IdUsuario != null)
            {
                return BadRequest(new { Mensaje = "El empleado ya tiene una cuenta de usuario" });
            }

            var resultList = await _procedures.sp_Emp_Crea_UsuarioEmpleadoAsync(rut);
            var result = resultList?.FirstOrDefault();

            if (result == null || result.Id_Usuario_Creado == null)
            {
                return BadRequest(new { Mensaje = result?.Mensaje ?? "Error al crear la cuenta de usuario" });
            }

            // Explicitly associate the employee with the newly created user
            employee.IdUsuario = result.Id_Usuario_Creado;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                IdUsuario = result.Id_Usuario_Creado,
                NombreUsuario = result.Nombre_Usuario_Creado,
                Mensaje = result.Mensaje
            });
        }

        [HttpPut("{id}/status")]
        [Permission(Permissions.UsersStatusEdit)]
        public async Task<IActionResult> ToggleEmployeeStatus(int id, [FromBody] bool active)
        {
            var employee = await _context.EmpEmpleados
                .Include(e => e.IdUsuarioNavigation)
                .FirstOrDefaultAsync(e => e.IdEmpleado == id);

            if (employee == null)
            {
                return NotFound(new { Mensaje = "Empleado no encontrado" });
            }

            employee.Activo = active;
            if (!active)
            {
                employee.FechaSalida = DateOnly.FromDateTime(DateTime.Now);
                // Also deactivate user if they have one
                if (employee.IdUsuarioNavigation != null)
                {
                    employee.IdUsuarioNavigation.Activo = false;
                    employee.IdUsuarioNavigation.FechaDesactivacion = DateTime.Now;

                    // Also deactivate all roles assigned
                    var userRoles = await _context.EmpRolesXusuario
                        .Where(rx => rx.IdUsuario == employee.IdUsuario && rx.Activo)
                        .ToListAsync();

                    foreach (var rx in userRoles)
                    {
                        rx.Activo = false;
                        rx.FechaDesactivacion = DateTime.Now;
                    }
                }
            }
            else
            {
                employee.FechaSalida = null;
                // Reactivate user if exists
                if (employee.IdUsuarioNavigation != null)
                {
                    employee.IdUsuarioNavigation.Activo = true;
                    employee.IdUsuarioNavigation.FechaDesactivacion = null;
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { Mensaje = $"Estado del empleado actualizado a {(active ? "Activo" : "Inactivo")}" });
        }
    }
}
