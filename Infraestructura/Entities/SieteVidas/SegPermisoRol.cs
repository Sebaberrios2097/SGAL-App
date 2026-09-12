using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Seg_PermisosXRol")]
public class SegPermisoRol
{
    [Column("Id_Rol_Usuario")]
    public int IdRolUsuario { get; set; }

    [Column("Id_Permiso")]
    public int IdPermiso { get; set; }

    public bool Activo { get; set; }
    [Column("Fecha_Asignacion", TypeName = "datetime")]
    public DateTime FechaAsignacion { get; set; }

    /// <summary>
    /// Límite numérico opcional que parametriza el permiso para este rol. Para el permiso
    /// ventas.descuento.aplicar es el porcentaje máximo de descuento que el rol puede aplicar.
    /// </summary>
    [Column("Valor_Limite", TypeName = "decimal(5, 2)")]
    public decimal? ValorLimite { get; set; }

    [ForeignKey(nameof(IdRolUsuario))]
    public EmpRolesUsuarios Rol { get; set; } = null!;
    [ForeignKey(nameof(IdPermiso))]
    public SegPermiso Permiso { get; set; } = null!;
}
