using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Orden_Detalle")]
public partial class InvOrdenDetalle
{
    [Key]
    [Column("Id_Orden_Detalle")]
    public int IdOrdenDetalle { get; set; }

    [Column("Id_Orden_Compra")]
    public int IdOrdenCompra { get; set; }

    [Column("Id_Producto")]
    public int? IdProducto { get; set; }

    [Column("Id_Materia_Prima")]
    public int? IdMateriaPrima { get; set; }

    [Column("Id_Formato_Compra")]
    public int? IdFormatoCompra { get; set; }

    [Column("Nombre_Formato")]
    [StringLength(100)]
    public string NombreFormato { get; set; } = null!;

    [Column("Cantidad_Contenido_Formato", TypeName = "decimal(18, 3)")]
    public decimal CantidadContenidoFormato { get; set; }

    [Column("Unidad_Contenido_Formato")]
    [StringLength(20)]
    public string UnidadContenidoFormato { get; set; } = null!;

    [Column(TypeName = "decimal(18, 3)")]
    public decimal Cantidad { get; set; }

    [Column("Precio_Unitario")]
    public int PrecioUnitario { get; set; }

    public int Subtotal { get; set; }

    [Column("Cantidad_Recibida", TypeName = "decimal(18, 3)")]
    public decimal CantidadRecibida { get; set; }

    [Column("Precio_Unitario_Real")]
    public int? PrecioUnitarioReal { get; set; }

    [Column("Subtotal_Real")]
    public int? SubtotalReal { get; set; }

    [Column("Precio_Venta_Anterior")]
    public int? PrecioVentaAnterior { get; set; }

    [Column("Nuevo_Precio_Venta")]
    public int? NuevoPrecioVenta { get; set; }

    [Column("Precio_Confirmado")]
    public bool PrecioConfirmado { get; set; }

    [Column("Observacion_Recepcion")]
    [StringLength(300)]
    public string? ObservacionRecepcion { get; set; }

    [ForeignKey("IdOrdenCompra")]
    [InverseProperty("InvOrdenDetalle")]
    public virtual InvOrdenCompra IdOrdenCompraNavigation { get; set; } = null!;

    [ForeignKey("IdProducto")]
    [InverseProperty("InvOrdenDetalle")]
    public virtual InvProductos? IdProductoNavigation { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvOrdenDetalle")]
    public virtual InvMateriaPrima? IdMateriaPrimaNavigation { get; set; }

    [ForeignKey("IdFormatoCompra")]
    public virtual InvFormatosCompra? IdFormatoCompraNavigation { get; set; }
}
