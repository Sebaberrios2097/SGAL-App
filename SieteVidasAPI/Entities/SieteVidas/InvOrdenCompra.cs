using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

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

    [Column("Fecha_Solicitud", TypeName = "datetime")]
    public DateTime FechaSolicitud { get; set; }

    [Column("Fecha_Llegada_Pedido", TypeName = "datetime")]
    public DateTime FechaLlegadaPedido { get; set; }

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
