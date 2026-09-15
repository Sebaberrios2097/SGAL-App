using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Ingrediente extra elegido para una línea de venta. Guarda el precio como snapshot
/// para reimpresión aunque el mantenedor cambie después. El consumo de materia prima
/// se registra en <see cref="VenDetalleVentaMateriales"/> para que la anulación reponga stock.
/// </summary>
[Table("Ven_Detalle_Venta_Ingredientes")]
public partial class VenDetalleVentaIngrediente
{
    [Key]
    [Column("Id_Detalle_Venta_Ingrediente")]
    public int IdDetalleVentaIngrediente { get; set; }

    [Column("Id_Detalle_Venta")]
    public int IdDetalleVenta { get; set; }

    /// <summary>Materia prima marcada como ingrediente extra elegida para la línea de venta.</summary>
    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    public int Precio { get; set; }

    [ForeignKey("IdDetalleVenta")]
    [InverseProperty("VenDetalleVentaIngrediente")]
    public virtual VenDetalleVenta IdDetalleVentaNavigation { get; set; } = null!;

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("VenDetalleVentaIngrediente")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;
}
