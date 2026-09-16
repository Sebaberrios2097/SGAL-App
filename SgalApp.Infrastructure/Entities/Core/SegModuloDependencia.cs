using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Seg_Modulos_Dependencias")]
public class SegModuloDependencia
{
    [Column("Id_Modulo")]
    public int IdModulo { get; set; }

    [Column("Id_Modulo_Requerido")]
    public int IdModuloRequerido { get; set; }

    [ForeignKey(nameof(IdModulo))]
    public SegModulo Modulo { get; set; } = null!;

    [ForeignKey(nameof(IdModuloRequerido))]
    public SegModulo ModuloRequerido { get; set; } = null!;
}
