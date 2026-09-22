using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

/// <summary>Una promoción aplicada en una venta, con su precio y el descuento resultante.</summary>
[Table("Ven_Venta_Promociones")]
public class VenVentaPromociones
{
    [Key, Column("Id_Venta_Promocion")]
    public int IdVentaPromocion { get; set; }

    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    [Column("Id_Promocion")]
    public int IdPromocion { get; set; }

    public int Cantidad { get; set; } = 1;

    public int Precio { get; set; }

    [Column("Monto_Individual")]
    public int MontoIndividual { get; set; }

    public int Descuento { get; set; }

    [ForeignKey("IdVenta")]
    public virtual VenVentas IdVentaNavigation { get; set; } = null!;

    [ForeignKey("IdPromocion")]
    public virtual VenPromociones IdPromocionNavigation { get; set; } = null!;

    [InverseProperty("IdVentaPromocionNavigation")]
    public virtual ICollection<VenDetalleVenta> Lineas { get; set; } = new List<VenDetalleVenta>();
}
