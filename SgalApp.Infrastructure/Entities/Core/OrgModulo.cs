using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Modulos")]
public class OrgModulo
{
    [Column("Id_Modulo")]
    public int IdModulo { get; set; }

    public bool Habilitado { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }

    [ForeignKey(nameof(IdModulo))]
    public SegModulo Modulo { get; set; } = null!;
}
