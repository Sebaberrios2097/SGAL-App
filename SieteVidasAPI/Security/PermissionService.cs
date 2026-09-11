using Infraestructura.Context;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Security;

public interface IPermissionService
{
    Task<bool> HasPermissionAsync(int userId, string permission);
    Task<List<string>> GetEffectivePermissionsAsync(int userId);
}

public sealed class PermissionService(SieteVidasContext context) : IPermissionService
{
    public Task<bool> HasPermissionAsync(int userId, string permission) =>
        context.SegPermisosXRol.AsNoTracking().AnyAsync(grant =>
            grant.Activo && grant.Permiso.Activo && grant.Permiso.Codigo == permission
            && grant.Rol.EmpRolesXusuario.Any(userRole =>
                userRole.IdUsuario == userId && userRole.Activo && userRole.IdUsuarioNavigation.Activo));

    public Task<List<string>> GetEffectivePermissionsAsync(int userId) =>
        context.SegPermisosXRol.AsNoTracking()
            .Where(grant => grant.Activo && grant.Permiso.Activo
                && grant.Rol.EmpRolesXusuario.Any(userRole =>
                    userRole.IdUsuario == userId && userRole.Activo && userRole.IdUsuarioNavigation.Activo))
            .Select(grant => grant.Permiso.Codigo)
            .Distinct().OrderBy(code => code).ToListAsync();
}
