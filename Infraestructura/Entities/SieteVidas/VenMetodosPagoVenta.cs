using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Se pueden registrar más de un método de pago para una venta en particular. La suma de todos los métodos de pago especificados para la venta deben ser igual al Monto_Total de dicha venta.
/// </summary>
[Table("Ven_Metodos_Pago_Venta")]
public partial class VenMetodosPagoVenta
{
    [Key]
    [Column("Id_Metodo_Pago_Venta")]
    public int IdMetodoPagoVenta { get; set; }

    [Column("Id_Metodo_Pago")]
    public int IdMetodoPago { get; set; }

    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    public int Monto { get; set; }

    [ForeignKey("IdMetodoPago")]
    [InverseProperty("VenMetodosPagoVenta")]
    public virtual VenMetodosPago IdMetodoPagoNavigation { get; set; } = null!;

    [ForeignKey("IdVenta")]
    [InverseProperty("VenMetodosPagoVenta")]
    public virtual VenVentas IdVentaNavigation { get; set; } = null!;
}
