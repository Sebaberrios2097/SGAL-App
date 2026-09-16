namespace SgalApp.Api.DTOs;

public class AssignPermissionsDto
{
    public List<int> PermissionIds { get; set; } = [];

    /// <summary>
    /// Límite numérico opcional por permiso (Id_Permiso → valor). Para el permiso
    /// ventas.descuento.aplicar es el porcentaje máximo de descuento del rol.
    /// </summary>
    public Dictionary<int, decimal?>? Limites { get; set; }
}
