using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Formatos_Compra")]
public partial class InvFormatosCompra
{
    [Key]
    [Column("Id_Formato_Compra")]
    public int IdFormatoCompra { get; set; }

    [Column("Id_Producto")]
    public int? IdProducto { get; set; }

    [Column("Id_Materia_Prima")]
    public int? IdMateriaPrima { get; set; }

    [Column("Nombre_Formato")]
    [StringLength(100)]
    public string NombreFormato { get; set; } = null!;

    [Column("Cantidad_Contenido", TypeName = "decimal(18,3)")]
    public decimal CantidadContenido { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime2")]
    public DateTime FechaCreacion { get; set; }

    [ForeignKey("IdProducto")]
    public virtual InvProductos? IdProductoNavigation { get; set; }

    [ForeignKey("IdMateriaPrima")]
    public virtual InvMateriaPrima? IdMateriaPrimaNavigation { get; set; }

    public virtual ICollection<InvOrdenDetalle> InvOrdenDetalle { get; set; } = new List<InvOrdenDetalle>();
}
