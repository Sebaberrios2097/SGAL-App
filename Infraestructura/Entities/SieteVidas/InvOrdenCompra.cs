using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Orden_Compra")]
public partial class InvOrdenCompra
{
    [Key]
    [Column("Id_Orden_Compra")]
    public int IdOrdenCompra { get; set; }

    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    [Column("Id_Proveedor")]
    public int IdProveedor { get; set; }

    [Column("Id_Estado_Orden_Compra")]
    public int IdEstadoOrdenCompra { get; set; }

    [Column("Cantidad_Productos")]
    public int CantidadProductos { get; set; }

    [Column("Monto_Total")]
    public int MontoTotal { get; set; }

    [Column("Monto_Total_Real")]
    public int? MontoTotalReal { get; set; }

    [Column("Fecha_Solicitud", TypeName = "datetime")]
    public DateTime FechaSolicitud { get; set; }

    [Column("Fecha_Llegada_Pedido", TypeName = "datetime")]
    public DateTime FechaLlegadaPedido { get; set; }

    [Column("Fecha_Emision", TypeName = "datetime2")]
    public DateTime? FechaEmision { get; set; }

    [Column("Fecha_Recepcion", TypeName = "datetime2")]
    public DateTime? FechaRecepcion { get; set; }

    [Column("Observaciones")]
    [StringLength(500)]
    public string? Observaciones { get; set; }

    [Column("Precios_Confirmados")]
    public bool PreciosConfirmados { get; set; }

    [Column("Fecha_Confirmacion_Precios", TypeName = "datetime2")]
    public DateTime? FechaConfirmacionPrecios { get; set; }

    [ForeignKey("IdEstadoOrdenCompra")]
    [InverseProperty("InvOrdenCompra")]
    public virtual InvEstadosOrdenCompra IdEstadoOrdenCompraNavigation { get; set; } = null!;

    [ForeignKey("IdProveedor")]
    [InverseProperty("InvOrdenCompra")]
    public virtual InvProveedores IdProveedorNavigation { get; set; } = null!;

    [ForeignKey("IdUsuario")]
    [InverseProperty("InvOrdenCompra")]
    public virtual EmpUsuarios IdUsuarioNavigation { get; set; } = null!;

    [InverseProperty("IdOrdenCompraNavigation")]
    public virtual ICollection<InvOrdenDetalle> InvOrdenDetalle { get; set; } = new List<InvOrdenDetalle>();
}
