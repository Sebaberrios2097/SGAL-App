using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Ven_Detalle_Venta")]
public partial class VenDetalleVenta
{
    [Key]
    [Column("Id_Detalle_Venta")]
    public int IdDetalleVenta { get; set; }

    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    public int Cantidad { get; set; }

    [Column("Precio_Normal")]
    public int PrecioNormal { get; set; }

    [Column("Precio_Unitario")]
    public int PrecioUnitario { get; set; }

    public int Subtotal { get; set; }

    [Column("Ind_Exento")]
    public bool? IndExento { get; set; }

    /// <summary>La línea (o porción) es cortesía: su valor no se cobra al empleado.</summary>
    [Column("Es_Cortesia")]
    public bool EsCortesia { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("VenDetalleVenta")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;

    [ForeignKey("IdVenta")]
    [InverseProperty("VenDetalleVenta")]
    public virtual VenVentas IdVentaNavigation { get; set; } = null!;

    [InverseProperty("IdDetalleVentaNavigation")]
    public virtual ICollection<VenDetalleVentaMateriales> VenDetalleVentaMateriales { get; set; } = new List<VenDetalleVentaMateriales>();

    [InverseProperty("IdDetalleVentaNavigation")]
    public virtual ICollection<VenDetalleVentaIngrediente> VenDetalleVentaIngrediente { get; set; } = new List<VenDetalleVentaIngrediente>();
}
