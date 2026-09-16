using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Seg_Permisos")]
public class SegPermiso
{
    [Key, Column("Id_Permiso")]
    public int IdPermiso { get; set; }

    [Column("Id_Modulo")]
    public int IdModulo { get; set; }

    [StringLength(150)]
    public string Codigo { get; set; } = null!;

    [StringLength(120)]
    public string Nombre { get; set; } = null!;

    [StringLength(300)]
    public string? Descripcion { get; set; }

    public bool EsCritico { get; set; }
    public bool Activo { get; set; }

    [ForeignKey(nameof(IdModulo))]
    public SegModulo Modulo { get; set; } = null!;
    public ICollection<SegPermisoRol> Roles { get; set; } = new List<SegPermisoRol>();
}
