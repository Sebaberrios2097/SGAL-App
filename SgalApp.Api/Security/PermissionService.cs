using SgalApp.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Api.Security;

public interface IPermissionService
{
    Task<bool> HasPermissionAsync(int userId, string permission);
    Task<List<string>> GetEffectivePermissionsAsync(int userId);

    /// <summary>Indica si el usuario tiene el rol Desarrollador activo (superusuario).</summary>
    Task<bool> IsDeveloperAsync(int userId);

    /// <summary>
    /// Porcentaje máximo de descuento que el usuario puede aplicar en una venta. Es el mayor
    /// límite entre sus roles activos que tengan el permiso ventas.descuento.aplicar; 0 si no
    /// puede aplicar descuentos. El Desarrollador (superusuario) puede aplicar hasta 100%.
    /// </summary>
    Task<decimal> GetMaxDiscountPercentAsync(int userId);
}

public sealed class PermissionService(SgalContext context) : IPermissionService
{
    // El Desarrollador es superusuario: pasa cualquier verificación de permisos y
    // posee todos los permisos efectivos. Así nunca puede bloquearse a sí mismo
    // (p. ej. quitándose un permiso sin poder reasignárselo después).
    public Task<bool> IsDeveloperAsync(int userId) =>
        context.EmpRolesXusuario.AsNoTracking().AnyAsync(userRole =>
            userRole.IdUsuario == userId
            && userRole.IdRolUsuario == RolesUsuario.Desarrollador
            && userRole.Activo && userRole.IdUsuarioNavigation.Activo);

    public async Task<bool> HasPermissionAsync(int userId, string permission)
    {
        var permissionBelongsToEnabledModule = await context.SegPermisos.AsNoTracking().AnyAsync(item =>
            item.Activo && item.Codigo == permission && item.Modulo.Activo
            && (item.Modulo.EsNucleo || (item.Modulo.ConfiguracionOrganizacion != null
                && item.Modulo.ConfiguracionOrganizacion.Habilitado))
            && (item.Modulo.ConfiguracionOrganizacion == null
                || item.Modulo.ConfiguracionOrganizacion.TodasFuncionalidades
                || item.ConfiguracionOrganizacion != null));

        if (!permissionBelongsToEnabledModule) return false;
        return await IsDeveloperAsync(userId)
            || await context.SegPermisosXRol.AsNoTracking().AnyAsync(grant =>
                grant.Activo && grant.Permiso.Activo && grant.Permiso.Codigo == permission
                && grant.Rol.EmpRolesXusuario.Any(userRole =>
                    userRole.IdUsuario == userId && userRole.Activo && userRole.IdUsuarioNavigation.Activo));
    }

    public async Task<decimal> GetMaxDiscountPercentAsync(int userId)
    {
        if (await IsDeveloperAsync(userId)) return 100m;

        var limites = await context.SegPermisosXRol.AsNoTracking()
            .Where(grant => grant.Activo && grant.Permiso.Activo
                && grant.Permiso.Modulo.Activo
                && (grant.Permiso.Modulo.EsNucleo || (grant.Permiso.Modulo.ConfiguracionOrganizacion != null
                    && grant.Permiso.Modulo.ConfiguracionOrganizacion.Habilitado))
                && (grant.Permiso.Modulo.ConfiguracionOrganizacion == null
                    || grant.Permiso.Modulo.ConfiguracionOrganizacion.TodasFuncionalidades
                    || grant.Permiso.ConfiguracionOrganizacion != null)
                && grant.Permiso.Codigo == "ventas.descuento.aplicar"
                && grant.Rol.EmpRolesXusuario.Any(userRole =>
                    userRole.IdUsuario == userId && userRole.Activo && userRole.IdUsuarioNavigation.Activo))
            .Select(grant => grant.ValorLimite)
            .ToListAsync();

        if (limites.Count == 0) return 0m;
        // Un límite NULL se interpreta como sin tope (100%).
        return limites.Max(v => v ?? 100m);
    }

    public async Task<List<string>> GetEffectivePermissionsAsync(int userId)
    {
        // El Desarrollador obtiene el catálogo completo de permisos activos.
        if (await IsDeveloperAsync(userId))
            return await context.SegPermisos.AsNoTracking()
                .Where(p => p.Activo && p.Modulo.Activo
                    && (p.Modulo.EsNucleo || (p.Modulo.ConfiguracionOrganizacion != null
                        && p.Modulo.ConfiguracionOrganizacion.Habilitado))
                    && (p.Modulo.ConfiguracionOrganizacion == null
                        || p.Modulo.ConfiguracionOrganizacion.TodasFuncionalidades
                        || p.ConfiguracionOrganizacion != null))
                .Select(p => p.Codigo)
                .OrderBy(code => code).ToListAsync();

        return await context.SegPermisosXRol.AsNoTracking()
            .Where(grant => grant.Activo && grant.Permiso.Activo
                && grant.Permiso.Modulo.Activo
                && (grant.Permiso.Modulo.EsNucleo || (grant.Permiso.Modulo.ConfiguracionOrganizacion != null
                    && grant.Permiso.Modulo.ConfiguracionOrganizacion.Habilitado))
                && (grant.Permiso.Modulo.ConfiguracionOrganizacion == null
                    || grant.Permiso.Modulo.ConfiguracionOrganizacion.TodasFuncionalidades
                    || grant.Permiso.ConfiguracionOrganizacion != null)
                && grant.Rol.EmpRolesXusuario.Any(userRole =>
                    userRole.IdUsuario == userId && userRole.Activo && userRole.IdUsuarioNavigation.Activo))
            .Select(grant => grant.Permiso.Codigo)
            .Distinct().OrderBy(code => code).ToListAsync();
    }
}
