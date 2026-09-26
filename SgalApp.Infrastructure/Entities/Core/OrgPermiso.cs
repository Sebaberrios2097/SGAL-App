using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Permisos")]
public class OrgPermiso
{
    [Column("Id_Permiso")]
    public int IdPermiso { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }

    [ForeignKey(nameof(IdPermiso))]
    public SegPermiso Permiso { get; set; } = null!;
}
