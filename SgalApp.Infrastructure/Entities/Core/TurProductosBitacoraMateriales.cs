using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Tur_Productos_Bitacora_Materiales")]
public partial class TurProductosBitacoraMateriales
{
    [Key]
    [Column("Id_Producto_Bitacora_Material")]
    public int IdProductoBitacoraMaterial { get; set; }

    [Column("Id_Productos_Bitacora")]
    public int IdProductosBitacora { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Descontada", TypeName = "decimal(18,3)")]
    public decimal CantidadDescontada { get; set; }

    [ForeignKey("IdProductosBitacora")]
    public virtual TurProductosBitacora IdProductosBitacoraNavigation { get; set; } = null!;

    [ForeignKey("IdMateriaPrima")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;
}
