using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Categorías de producto elegibles para la cortesía cuando la política está en modo "MONTO":
/// cualquier producto de una categoría activa entra en la cortesía hasta agotar el monto diario.
/// </summary>
[Table("Inv_Categorias_Cortesia")]
public partial class InvCategoriasCortesia
{
    [Key]
    [Column("Id_Categoria_Cortesia")]
    public int IdCategoriaCortesia { get; set; }

    [Column("Id_Categoria_Producto")]
    public int IdCategoriaProducto { get; set; }

    public int Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime FechaModificacion { get; set; }

    [ForeignKey("IdCategoriaProducto")]
    [InverseProperty("InvCategoriasCortesia")]
    public virtual InvCategoriaProductos IdCategoriaProductoNavigation { get; set; } = null!;
}
