using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Productos")]
public partial class InvProductos
{
    [Key]
    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Id_Categoria_Producto")]
    public int IdCategoriaProducto { get; set; }

    [Column("Nombre_Producto")]
    [StringLength(150)]
    public string NombreProducto { get; set; } = null!;

    [Column("Descripcion_Producto")]
    [StringLength(300)]
    public string? DescripcionProducto { get; set; }

    public byte[]? Imagen { get; set; }

    public int Precio { get; set; }

    public int? Stock { get; set; }

    [Column("Fecha_Ingreso", TypeName = "datetime")]
    public DateTime FechaIngreso { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [ForeignKey("IdCategoriaProducto")]
    [InverseProperty("InvProductos")]
    public virtual InvCategoriaProductos IdCategoriaProductoNavigation { get; set; } = null!;

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvDescuentosProductos> InvDescuentosProductos { get; set; } = new List<InvDescuentosProductos>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvOrdenDetalle> InvOrdenDetalle { get; set; } = new List<InvOrdenDetalle>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();
}
