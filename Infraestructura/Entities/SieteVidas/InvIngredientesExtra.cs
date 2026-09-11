using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Ingrediente extra que se puede añadir a la preparación de un producto en la venta.
/// Cada extra descuenta una única materia prima (cantidad + unidad fija) y suma su precio
/// como recargo por unidad del producto.
/// </summary>
[Table("Inv_Ingredientes_Extra")]
public partial class InvIngredientesExtra
{
    [Key]
    [Column("Id_Ingrediente_Extra")]
    public int IdIngredienteExtra { get; set; }

    [Column("Nombre_Ingrediente_Extra")]
    [StringLength(50)]
    public string NombreIngredienteExtra { get; set; } = null!;

    [StringLength(150)]
    public string? Descripcion { get; set; }

    public int Precio { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Requerida", TypeName = "decimal(18,3)")]
    public decimal CantidadRequerida { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvIngredientesExtra")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvIngredientesExtra")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;

    [InverseProperty("IdIngredienteExtraNavigation")]
    public virtual ICollection<VenDetalleVentaIngrediente> VenDetalleVentaIngrediente { get; set; } = new List<VenDetalleVentaIngrediente>();
}
