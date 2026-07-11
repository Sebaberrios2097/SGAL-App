using Infraestructura.Context;
using Infraestructura.Data;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;

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

        [HttpPost]
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

        [HttpPost("{rut}/create-user")]
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
