using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

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
        [Permission(Permissions.RolesView)]
        public async Task<IActionResult> GetRoles()
        {
            var roles = await _context.EmpRolesUsuarios
                .OrderBy(r => r.NombreRol)
                .ToListAsync();
            return Ok(roles);
        }

        [HttpPost]
        [Permission(Permissions.RolesCreate)]
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
        [Permission(Permissions.RolesEdit)]
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
        [Permission(Permissions.RolesDelete)]
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
        [Permission(Permissions.UsersRolesAssign)]
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
            var callerPermissions = (await _context.SegPermisosXRol.AsNoTracking()
                .Where(x => x.Activo && x.Permiso.Activo && x.Rol.EmpRolesXusuario
                    .Any(ur => ur.IdUsuario == User.GetUserId() && ur.Activo))
                .Select(x => x.IdPermiso).Distinct().ToListAsync()).ToHashSet();
            var grantsOutsideCaller = await _context.SegPermisosXRol.AsNoTracking()
                .AnyAsync(x => newRoleIds.Contains(x.IdRolUsuario) && x.Activo && !callerPermissions.Contains(x.IdPermiso));
            if (grantsOutsideCaller)
                return StatusCode(403, new { Mensaje = "No puede asignar un rol con permisos que usted no posee." });

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

        [HttpGet("permissions/catalog")]
        [Permission(Permissions.RolesView)]
        public async Task<IActionResult> GetPermissionCatalog()
        {
            var modules = await _context.SegModulos.AsNoTracking()
                .Where(x => x.Activo).OrderBy(x => x.Orden)
                .Select(x => new
                {
                    x.IdModulo, x.Codigo, x.Nombre,
                    Permisos = x.Permisos.Where(p => p.Activo).OrderBy(p => p.Nombre)
                        .Select(p => new { p.IdPermiso, p.Codigo, p.Nombre, p.Descripcion, p.EsCritico })
                }).ToListAsync();
            return Ok(modules);
        }

        [HttpGet("{id:int}/permissions")]
        [Permission(Permissions.RolesView)]
        public async Task<IActionResult> GetRolePermissions(int id)
        {
            if (!await _context.EmpRolesUsuarios.AnyAsync(x => x.IdRolUsuario == id))
                return NotFound(new { Mensaje = "Rol no encontrado" });
            var permissionIds = await _context.SegPermisosXRol.AsNoTracking()
                .Where(x => x.IdRolUsuario == id && x.Activo).Select(x => x.IdPermiso).ToListAsync();
            return Ok(new { IdRolUsuario = id, PermissionIds = permissionIds });
        }

        [HttpPut("{id:int}/permissions")]
        [Permission(Permissions.RolesPermissionsAssign)]
        public async Task<IActionResult> SetRolePermissions(int id, [FromBody] AssignPermissionsDto dto)
        {
            if (!await _context.EmpRolesUsuarios.AnyAsync(x => x.IdRolUsuario == id))
                return NotFound(new { Mensaje = "Rol no encontrado" });

            var requested = dto.PermissionIds.Distinct().ToHashSet();
            var existingPermissionIds = await _context.SegPermisos.Where(x => x.Activo && requested.Contains(x.IdPermiso))
                .Select(x => x.IdPermiso).ToListAsync();
            if (existingPermissionIds.Count != requested.Count)
                return BadRequest(new { Mensaje = "Uno o más permisos no existen o están inactivos." });

            var requestedCodes = await _context.SegPermisos.AsNoTracking()
                .Where(x => requested.Contains(x.IdPermiso)).Select(x => x.Codigo).ToListAsync();
            var missingDependencies = PermissionDependencies.MissingFrom(requestedCodes);
            if (missingDependencies.Count > 0)
                return BadRequest(new
                {
                    Mensaje = "La selección contiene acciones sin sus permisos de lectura u operación requeridos.",
                    PermisosRequeridos = missingDependencies.OrderBy(x => x)
                });

            var callerPermissionIds = await _context.SegPermisosXRol.AsNoTracking()
                .Where(x => x.Activo && x.Permiso.Activo && x.Rol.EmpRolesXusuario
                    .Any(ur => ur.IdUsuario == User.GetUserId() && ur.Activo))
                .Select(x => x.IdPermiso).Distinct().ToListAsync();
            var outsideCaller = requested.Except(callerPermissionIds).Any();
            if (outsideCaller)
                return StatusCode(403, new { Mensaje = "No puede conceder permisos que usted no posee." });

            var grants = await _context.SegPermisosXRol.Where(x => x.IdRolUsuario == id).ToListAsync();
            foreach (var grant in grants) grant.Activo = requested.Contains(grant.IdPermiso);
            foreach (var permissionId in requested.Where(permissionId => grants.All(x => x.IdPermiso != permissionId)))
                _context.SegPermisosXRol.Add(new SegPermisoRol
                {
                    IdRolUsuario = id, IdPermiso = permissionId, Activo = true, FechaAsignacion = DateTime.Now
                });
            await _context.SaveChangesAsync();
            return Ok(new { Mensaje = "Permisos actualizados.", PermissionIds = requested.OrderBy(x => x) });
        }
    }
}
