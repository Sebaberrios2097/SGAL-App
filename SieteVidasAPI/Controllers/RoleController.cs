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
        private readonly IPermissionService _permissions;

        public RoleController(SieteVidasContext context, IPermissionService permissions)
        {
            _context = context;
            _permissions = permissions;
        }

        [HttpGet]
        [Permission(Permissions.RolesView)]
        public async Task<IActionResult> GetRoles()
        {
            // El rol Desarrollador (superusuario) solo es visible para el propio Desarrollador:
            // nadie más puede verlo, asignarlo ni editar sus permisos.
            var esDev = await _permissions.IsDeveloperAsync(User.GetUserId());
            var query = _context.EmpRolesUsuarios.AsQueryable();
            if (!esDev)
                query = query.Where(r => r.IdRolUsuario != RolesUsuario.Desarrollador);

            var roles = await query.OrderBy(r => r.NombreRol).ToListAsync();
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
            if (await IsProtectedDeveloperRoleAsync(id))
                return NotFound(new { Mensaje = "Rol no encontrado" });

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
            if (await IsProtectedDeveloperRoleAsync(id))
                return NotFound(new { Mensaje = "Rol no encontrado" });

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
            // El Desarrollador (superusuario) puede asignar cualquier rol sin restricción.
            if (!await _permissions.IsDeveloperAsync(User.GetUserId()))
            {
                // Nadie fuera del Desarrollador puede asignar el rol Desarrollador.
                if (newRoleIds.Contains(RolesUsuario.Desarrollador))
                    return StatusCode(403, new { Mensaje = "No puede asignar el rol Desarrollador." });

                var callerPermissions = (await _context.SegPermisosXRol.AsNoTracking()
                    .Where(x => x.Activo && x.Permiso.Activo && x.Rol.EmpRolesXusuario
                        .Any(ur => ur.IdUsuario == User.GetUserId() && ur.Activo))
                    .Select(x => x.IdPermiso).Distinct().ToListAsync()).ToHashSet();
                var grantsOutsideCaller = await _context.SegPermisosXRol.AsNoTracking()
                    .AnyAsync(x => newRoleIds.Contains(x.IdRolUsuario) && x.Activo && !callerPermissions.Contains(x.IdPermiso));
                if (grantsOutsideCaller)
                    return StatusCode(403, new { Mensaje = "No puede asignar un rol con permisos que usted no posee." });
            }

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
            // Solo módulos activos que tengan al menos un permiso activo, y solo permisos activos.
            var modules = await _context.SegModulos.AsNoTracking()
                .Where(x => x.Activo && x.Permisos.Any(p => p.Activo)).OrderBy(x => x.Orden)
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
            if (await IsProtectedDeveloperRoleAsync(id))
                return NotFound(new { Mensaje = "Rol no encontrado" });
            if (!await _context.EmpRolesUsuarios.AnyAsync(x => x.IdRolUsuario == id))
                return NotFound(new { Mensaje = "Rol no encontrado" });
            // Solo permisos activos: los permisos legacy desactivados no se muestran ni se reenvían.
            var grants = await _context.SegPermisosXRol.AsNoTracking()
                .Where(x => x.IdRolUsuario == id && x.Activo && x.Permiso.Activo)
                .Select(x => new { x.IdPermiso, x.ValorLimite }).ToListAsync();
            return Ok(new
            {
                IdRolUsuario = id,
                PermissionIds = grants.Select(x => x.IdPermiso).ToList(),
                Limites = grants.Where(x => x.ValorLimite != null).ToDictionary(x => x.IdPermiso, x => x.ValorLimite)
            });
        }

        [HttpPut("{id:int}/permissions")]
        [Permission(Permissions.RolesPermissionsAssign)]
        public async Task<IActionResult> SetRolePermissions(int id, [FromBody] AssignPermissionsDto dto)
        {
            if (await IsProtectedDeveloperRoleAsync(id))
                return NotFound(new { Mensaje = "Rol no encontrado" });
            if (!await _context.EmpRolesUsuarios.AnyAsync(x => x.IdRolUsuario == id))
                return NotFound(new { Mensaje = "Rol no encontrado" });

            var requested = dto.PermissionIds.Distinct().ToHashSet();
            var existingPermissionIds = await _context.SegPermisos.Where(x => x.Activo && requested.Contains(x.IdPermiso))
                .Select(x => x.IdPermiso).ToListAsync();
            if (existingPermissionIds.Count != requested.Count)
                return BadRequest(new { Mensaje = "Uno o más permisos no existen o están inactivos." });

            // Los permisos son completamente independientes: no se exige que la selección
            // incluya permisos de lectura/operación de otros recursos. Cada pantalla que
            // necesita datos de referencia (unidades, categorías, materias primas, productos…)
            // los lee por un endpoint que acepta el permiso de esa misma pantalla.

            // El Desarrollador (superusuario) puede conceder cualquier permiso. El resto solo puede
            // agregar o quitar permisos dentro de su propio alcance; los permisos que el rol ya tiene
            // y que el usuario NO posee deben preservarse intactos (no puede agregarlos ni quitarlos).
            if (!await _permissions.IsDeveloperAsync(User.GetUserId()))
            {
                var callerPermissionIds = (await _context.SegPermisosXRol.AsNoTracking()
                    .Where(x => x.Activo && x.Permiso.Activo && x.Rol.EmpRolesXusuario
                        .Any(ur => ur.IdUsuario == User.GetUserId() && ur.Activo))
                    .Select(x => x.IdPermiso).Distinct().ToListAsync()).ToHashSet();
                var existingIds = (await _context.SegPermisosXRol.AsNoTracking()
                    .Where(x => x.IdRolUsuario == id && x.Activo && x.Permiso.Activo)
                    .Select(x => x.IdPermiso).ToListAsync()).ToHashSet();

                var agregaFueraDeAlcance = requested.Any(pid => !existingIds.Contains(pid) && !callerPermissionIds.Contains(pid));
                var quitaFueraDeAlcance = existingIds.Any(pid => !callerPermissionIds.Contains(pid) && !requested.Contains(pid));
                if (agregaFueraDeAlcance || quitaFueraDeAlcance)
                    return StatusCode(403, new { Mensaje = "No puede conceder ni quitar permisos que usted no posee." });
            }

            decimal? LimiteDe(int permissionId) =>
                dto.Limites != null && dto.Limites.TryGetValue(permissionId, out var valor) ? valor : null;

            // El tope de descuento que se otorga a un rol no puede superar el propio del usuario
            // (mismo principio: solo puede asignar hasta lo que él mismo tiene). El Desarrollador
            // tiene tope 100%, por lo que puede otorgar cualquier valor válido.
            var discountPermId = await _context.SegPermisos.AsNoTracking()
                .Where(p => p.Activo && p.Codigo == Permissions.SalesDiscountApply)
                .Select(p => (int?)p.IdPermiso).FirstOrDefaultAsync();
            if (discountPermId.HasValue && requested.Contains(discountPermId.Value))
            {
                var callerMaxDescuento = await _permissions.GetMaxDiscountPercentAsync(User.GetUserId());
                var limiteOtorgado = LimiteDe(discountPermId.Value) ?? 100m; // null = sin tope = 100%
                if (limiteOtorgado > callerMaxDescuento)
                    return StatusCode(403, new { Mensaje = $"No puede otorgar un descuento máximo mayor al suyo ({callerMaxDescuento:0.##}%)." });
            }

            // Permisos activos: los grants a permisos legacy desactivados se dejan intactos.
            var activePermissionIds = (await _context.SegPermisos.AsNoTracking()
                .Where(p => p.Activo).Select(p => p.IdPermiso).ToListAsync()).ToHashSet();

            var grants = await _context.SegPermisosXRol.Where(x => x.IdRolUsuario == id).ToListAsync();
            foreach (var grant in grants)
            {
                if (!activePermissionIds.Contains(grant.IdPermiso)) continue;
                grant.Activo = requested.Contains(grant.IdPermiso);
                if (grant.Activo) grant.ValorLimite = LimiteDe(grant.IdPermiso);
            }
            foreach (var permissionId in requested.Where(permissionId => grants.All(x => x.IdPermiso != permissionId)))
                _context.SegPermisosXRol.Add(new SegPermisoRol
                {
                    IdRolUsuario = id, IdPermiso = permissionId, Activo = true, FechaAsignacion = DateTime.Now,
                    ValorLimite = LimiteDe(permissionId)
                });
            await _context.SaveChangesAsync();
            return Ok(new { Mensaje = "Permisos actualizados.", PermissionIds = requested.OrderBy(x => x) });
        }

        /// <summary>
        /// True si el rol es el Desarrollador y el usuario actual no es Desarrollador: en ese caso
        /// el rol se trata como inexistente (no se ve, ni se edita, ni se le tocan permisos).
        /// </summary>
        private async Task<bool> IsProtectedDeveloperRoleAsync(int roleId)
        {
            if (roleId != RolesUsuario.Desarrollador) return false;
            return !await _permissions.IsDeveloperAsync(User.GetUserId());
        }
    }
}
