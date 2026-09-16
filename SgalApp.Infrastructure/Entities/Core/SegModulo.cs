using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Seg_Modulos")]
public class SegModulo
{
    [Key, Column("Id_Modulo")]
    public int IdModulo { get; set; }

    [StringLength(80)]
    public string Codigo { get; set; } = null!;

    [StringLength(120)]
    public string Nombre { get; set; } = null!;

    [StringLength(500)]
    public string? Descripcion { get; set; }

    public int Orden { get; set; }
    public bool Activo { get; set; }

    [Column("Es_Nucleo")]
    public bool EsNucleo { get; set; }

    public ICollection<SegPermiso> Permisos { get; set; } = new List<SegPermiso>();
    public OrgModulo? ConfiguracionOrganizacion { get; set; }
    public ICollection<SegModuloDependencia> Dependencias { get; set; } = new List<SegModuloDependencia>();
    public ICollection<SegModuloDependencia> RequeridoPor { get; set; } = new List<SegModuloDependencia>();
}
