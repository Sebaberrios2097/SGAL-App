using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Seg_Modulos")]
public class SegModulo
{
    [Key, Column("Id_Modulo")]
    public int IdModulo { get; set; }

    [StringLength(80)]
    public string Codigo { get; set; } = null!;

    [StringLength(120)]
    public string Nombre { get; set; } = null!;

    public int Orden { get; set; }
    public bool Activo { get; set; }

    public ICollection<SegPermiso> Permisos { get; set; } = new List<SegPermiso>();
}
