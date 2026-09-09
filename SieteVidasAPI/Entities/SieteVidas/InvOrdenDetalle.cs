using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Inv_Orden_Detalle")]
public partial class InvOrdenDetalle
{
    [Key]
    [Column("Id_Orden_Detalle")]
    public int IdOrdenDetalle { get; set; }

    [Column("Id_Orden_Compra")]
    public int IdOrdenCompra { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    public int Cantidad { get; set; }

    [Column("Precio_Unitario")]
    public int PrecioUnitario { get; set; }

    public int Subtotal { get; set; }

    [ForeignKey("IdOrdenCompra")]
    [InverseProperty("InvOrdenDetalle")]
    public virtual InvOrdenCompra IdOrdenCompraNavigation { get; set; } = null!;

    [ForeignKey("IdProducto")]
    [InverseProperty("InvOrdenDetalle")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;
}
