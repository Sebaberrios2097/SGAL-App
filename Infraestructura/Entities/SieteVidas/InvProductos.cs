using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Productos")]
[Index("CodigoProducto", Name = "UX_Inv_Productos_Codigo_Producto", IsUnique = true)]
public partial class InvProductos
{
    [Key]
    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Id_Categoria_Producto")]
    public int IdCategoriaProducto { get; set; }

    [Column("Codigo_Producto")]
    [StringLength(50)]
    [Unicode(false)]
    public string CodigoProducto { get; set; } = null!;

    [Column("Nombre_Producto")]
    [StringLength(150)]
    public string NombreProducto { get; set; } = null!;

    [Column("Descripcion_Producto")]
    [StringLength(300)]
    public string? DescripcionProducto { get; set; }

    public byte[]? Imagen { get; set; }

    public int Precio { get; set; }

    public int? Stock { get; set; }

    [Column("Requiere_Receta")]
    public bool? RequiereReceta { get; set; }

    [Column("Acepta_Ingredientes_Extra")]
    public bool AceptaIngredientesExtra { get; set; }

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
    public virtual ICollection<InvProductosCortesia> InvProductosCortesia { get; set; } = new List<InvProductosCortesia>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvRecetas> InvRecetas { get; set; } = new List<InvRecetas>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<TurProductosBitacora> TurProductosBitacora { get; set; } = new List<TurProductosBitacora>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();
}
