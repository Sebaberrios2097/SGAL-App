using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Ven_Detalle_Venta_Materiales")]
public partial class VenDetalleVentaMateriales
{
    [Key]
    [Column("Id_Detalle_Venta_Material")]
    public int IdDetalleVentaMaterial { get; set; }

    [Column("Id_Detalle_Venta")]
    public int IdDetalleVenta { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Descontada", TypeName = "decimal(18,3)")]
    public decimal CantidadDescontada { get; set; }

    [ForeignKey("IdDetalleVenta")]
    [InverseProperty("VenDetalleVentaMateriales")]
    public virtual VenDetalleVenta IdDetalleVentaNavigation { get; set; } = null!;

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("VenDetalleVentaMateriales")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;
}
