using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Productos")]
// El código de producto es opcional; la unicidad se aplica solo a los códigos no nulos
// mediante un índice único filtrado definido en la base de datos.
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
    public string? CodigoProducto { get; set; }

    [Column("Nombre_Producto")]
    [StringLength(150)]
    public string NombreProducto { get; set; } = null!;

    [Column("Descripcion_Producto")]
    [StringLength(300)]
    public string? DescripcionProducto { get; set; }

    public byte[]? Imagen { get; set; }

    public int Precio { get; set; }

    public int? Stock { get; set; }

    /// <summary>Umbral de bajo stock propio del producto; NULL usa el default global de la organización.</summary>
    [Column("Stock_Minimo")]
    public int? StockMinimo { get; set; }

    /// <summary>El producto es un pack de otro producto (no tiene stock propio).</summary>
    [Column("Es_Pack")]
    public bool EsPack { get; set; }

    /// <summary>Producto base del que se descuenta el stock al vender este pack.</summary>
    [Column("Id_Producto_Base")]
    public int? IdProductoBase { get; set; }

    /// <summary>Unidades del producto base que representa una unidad de este pack.</summary>
    [Column("Cantidad_Pack")]
    public int? CantidadPack { get; set; }

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

    [ForeignKey("IdProductoBase")]
    [InverseProperty("PacksDelProducto")]
    public virtual InvProductos? IdProductoBaseNavigation { get; set; }

    [InverseProperty("IdProductoBaseNavigation")]
    public virtual ICollection<InvProductos> PacksDelProducto { get; set; } = new List<InvProductos>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvDescuentosProductos> InvDescuentosProductos { get; set; } = new List<InvDescuentosProductos>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvOrdenDetalle> InvOrdenDetalle { get; set; } = new List<InvOrdenDetalle>();

    public virtual ICollection<InvFormatosCompra> InvFormatosCompra { get; set; } = new List<InvFormatosCompra>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvProductosCortesia> InvProductosCortesia { get; set; } = new List<InvProductosCortesia>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<InvRecetas> InvRecetas { get; set; } = new List<InvRecetas>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<TurProductosBitacora> TurProductosBitacora { get; set; } = new List<TurProductosBitacora>();

    [InverseProperty("IdProductoNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();
}
