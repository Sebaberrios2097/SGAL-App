using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoleController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public RoleController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetRoles()
        {
            var roles = await _context.EmpRolesUsuarios
                .OrderBy(r => r.NombreRol)
                .ToListAsync();
            return Ok(roles);
        }

        [HttpPost]
        public async Task<IActionResult> CreateRole([FromBody] string roleName)
        {
            if (string.IsNullOrWhiteSpace(roleName))
            {
                return BadRequest(new { Mensaje = "El nombre del rol es obligatorio" });
            }

            var existing = await _context.EmpRolesUsuarios
                .FirstOrDefaultAsync(r => r.NombreRol.ToLower() == roleName.ToLower());

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "El rol ya existe" });
            }

            var role = new EmpRolesUsuarios { NombreRol = roleName };
            _context.EmpRolesUsuarios.Add(role);
            await _context.SaveChangesAsync();

            return Ok(role);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRole(int id, [FromBody] string roleName)
        {
            if (string.IsNullOrWhiteSpace(roleName))
            {
                return BadRequest(new { Mensaje = "El nombre del rol es obligatorio" });
            }

            var role = await _context.EmpRolesUsuarios.FindAsync(id);
            if (role == null)
            {
                return NotFound(new { Mensaje = "Rol no encontrado" });
            }

            var existing = await _context.EmpRolesUsuarios
                .FirstOrDefaultAsync(r => r.NombreRol.ToLower() == roleName.ToLower() && r.IdRolUsuario != id);

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "Ya existe otro rol con ese nombre" });
            }

            role.NombreRol = roleName;
            await _context.SaveChangesAsync();

            return Ok(role);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRole(int id)
        {
            var role = await _context.EmpRolesUsuarios.FindAsync(id);
            if (role == null)
            {
                return NotFound(new { Mensaje = "Rol no encontrado" });
            }

            // Check if anyone has this role active
            var inUse = await _context.EmpRolesXusuario.AnyAsync(rx => rx.IdRolUsuario == id && rx.Activo);
            if (inUse)
            {
                return BadRequest(new { Mensaje = "No se puede eliminar el rol porque está asignado a usuarios activos" });
            }

            // Remove any inactive associations to clean up
            var associations = await _context.EmpRolesXusuario.Where(rx => rx.IdRolUsuario == id).ToListAsync();
            _context.EmpRolesXusuario.RemoveRange(associations);

            _context.EmpRolesUsuarios.Remove(role);
            await _context.SaveChangesAsync();

            return Ok(new { Mensaje = "Rol eliminado con éxito" });
        }

        [HttpPost("users/{userId}/roles")]
        public async Task<IActionResult> AssignRoles(int userId, [FromBody] AssignRolesDto dto)
        {
            var user = await _context.EmpUsuarios.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new { Mensaje = "Usuario no encontrado" });
            }

            // Get existing associations (both active and inactive)
            var existingAssociations = await _context.EmpRolesXusuario
                .Where(rx => rx.IdUsuario == userId)
                .ToListAsync();

            // Set of new role IDs requested
            var newRoleIds = dto.RoleIds.ToHashSet();

            // 1. Deactivate roles that are not in the new list
            foreach (var assoc in existingAssociations.Where(rx => rx.Activo))
            {
                if (!newRoleIds.Contains(assoc.IdRolUsuario))
                {
                    assoc.Activo = false;
                    assoc.FechaDesactivacion = DateTime.Now;
                }
            }

            // 2. Reactivate or create roles that are in the new list
            foreach (var roleId in newRoleIds)
            {
                var existingAssoc = existingAssociations.FirstOrDefault(rx => rx.IdRolUsuario == roleId);
                if (existingAssoc != null)
                {
                    if (!existingAssoc.Activo)
                    {
                        existingAssoc.Activo = true;
                        existingAssoc.FechaAsignacion = DateTime.Now;
                        existingAssoc.FechaDesactivacion = null;
                    }
                }
                else
                {
                    // Verify that the role actually exists
                    var roleExists = await _context.EmpRolesUsuarios.AnyAsync(r => r.IdRolUsuario == roleId);
                    if (roleExists)
                    {
                        var newAssoc = new EmpRolesXusuario
                        {
                            IdUsuario = userId,
                            IdRolUsuario = roleId,
                            Activo = true,
                            FechaAsignacion = DateTime.Now
                        };
                        _context.EmpRolesXusuario.Add(newAssoc);
                    }
                }
            }

            await _context.SaveChangesAsync();

            // Return updated roles
            var updatedRoles = await _context.EmpRolesXusuario
                .Where(rx => rx.IdUsuario == userId && rx.Activo)
                .Select(rx => new
                {
                    rx.IdRolUsuario,
                    rx.IdRolUsuarioNavigation.NombreRol
                })
                .ToListAsync();

            return Ok(updatedRoles);
        }
    }
}
