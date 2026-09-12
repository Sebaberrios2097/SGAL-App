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

    /// <summary>
    /// Producto al que pertenece la receta. Es NULL en las preparaciones base independientes.
    /// </summary>
    [Column("Id_Producto")]
    public int? IdProducto { get; set; }

    /// <summary>
    /// Nombre de la receta. Se usa en las preparaciones base (que no tienen producto);
    /// en las recetas de producto queda NULL y el nombre se toma del producto.
    /// </summary>
    [StringLength(100)]
    public string? Nombre { get; set; }

    /// <summary>
    /// Indica que la receta es una preparación base reutilizable (sin producto asociado).
    /// Solo las preparaciones base pueden usarse como base de otras recetas.
    /// </summary>
    [Column("Es_Preparacion_Base")]
    public bool EsPreparacionBase { get; set; }

    /// <summary>
    /// Preparación base opcional sobre la que se construye esta receta. Al consumir se descuentan
    /// primero los materiales de la base (de forma recursiva) y luego los propios. El vínculo es
    /// vivo: si la base usa café por calibración, los derivados también.
    /// </summary>
    [Column("Id_Receta_Base")]
    public int? IdRecetaBase { get; set; }

    public bool Estado { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvRecetas")]
    public virtual InvProductos? IdProductoNavigation { get; set; }

    [ForeignKey("IdRecetaBase")]
    [InverseProperty("InvRecetasComoBase")]
    public virtual InvRecetas? IdRecetaBaseNavigation { get; set; }

    /// <summary>Recetas que usan esta preparación como base.</summary>
    [InverseProperty("IdRecetaBaseNavigation")]
    public virtual ICollection<InvRecetas> InvRecetasComoBase { get; set; } = new List<InvRecetas>();

    [InverseProperty("IdRecetaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesReceta { get; set; } = new List<InvMaterialesReceta>();
}
