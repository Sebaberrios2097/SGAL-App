using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Productos_Proveedores")]
public partial class InvProductosProveedores
{
    [Key]
    [Column("Id_Producto_Proveedor")]
    public int IdProductoProveedor { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Id_Proveedor")]
    public int IdProveedor { get; set; }

    public bool Activo { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvProductosProveedores")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;

    [ForeignKey("IdProveedor")]
    [InverseProperty("InvProductosProveedores")]
    public virtual InvProveedores IdProveedorNavigation { get; set; } = null!;
}
