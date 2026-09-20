using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Categoria_Productos")]
public partial class InvCategoriaProductos
{
    [Key]
    [Column("Id_Categoria_Producto")]
    public int IdCategoriaProducto { get; set; }

    [Column("Nombre_Categoria_Producto")]
    [StringLength(100)]
    public string NombreCategoriaProducto { get; set; } = null!;

    /// <summary>
    /// Indica si los productos que pertenezcan a la categoría tendrán receta para elaborar el producto. Si tienen, el producto no tendrá stock directo.
    /// </summary>
    [Column("Requiere_Receta")]
    public bool RequiereReceta { get; set; }

    [Column("Fecha_Ingreso", TypeName = "datetime")]
    public DateTime FechaIngreso { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [InverseProperty("IdCategoriaProductoNavigation")]
    public virtual ICollection<InvProductos> InvProductos { get; set; } = new List<InvProductos>();

    [InverseProperty("IdCategoriaProductoNavigation")]
    public virtual ICollection<InvCategoriasCortesia> InvCategoriasCortesia { get; set; } = new List<InvCategoriasCortesia>();
}
