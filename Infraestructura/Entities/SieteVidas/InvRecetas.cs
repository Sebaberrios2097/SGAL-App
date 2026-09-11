using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Recetas")]
public partial class InvRecetas
{
    [Key]
    [Column("Id_Receta")]
    public int IdReceta { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    /// <summary>
    /// Preparación base opcional sobre la que se construye esta receta. Al consumir el producto
    /// se descuentan primero los materiales de la base (de forma recursiva) y luego los propios.
    /// El vínculo es vivo: si la base usa café por calibración, los derivados también.
    /// </summary>
    [Column("Id_Producto_Base")]
    public int? IdProductoBase { get; set; }

    public bool Estado { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvRecetas")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;

    [ForeignKey("IdProductoBase")]
    [InverseProperty("InvRecetasComoBase")]
    public virtual InvProductos? IdProductoBaseNavigation { get; set; }

    [InverseProperty("IdRecetaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesReceta { get; set; } = new List<InvMaterialesReceta>();
}
