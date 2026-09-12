using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Tur_Extracciones")]
public partial class TurExtracciones
{
    [Key]
    [Column("Id_Extraccion")]
    public int IdExtraccion { get; set; }

    [Column("Id_Bitacora")]
    public int IdBitacora { get; set; }

    /// <summary>
    /// Materia prima (café) cuyo stock descontó esta extracción. Nullable: extracciones
    /// históricas o calibraciones con café no controlado en inventario quedan sin asociación.
    /// </summary>
    [Column("Id_Materia_Prima")]
    public int? IdMateriaPrima { get; set; }

    public double Gramos { get; set; }

    public int Segundos { get; set; }

    public double Mililitros { get; set; }

    /// <summary>
    /// Cantidad realmente descontada del stock de la materia prima, en su propia unidad.
    /// Permite reponer exactamente el inventario si la extracción se revierte.
    /// </summary>
    [Column("Cantidad_Descontada", TypeName = "decimal(18,3)")]
    public decimal CantidadDescontada { get; set; }

    [StringLength(300)]
    public string? Observaciones { get; set; }

    [ForeignKey("IdBitacora")]
    [InverseProperty("TurExtracciones")]
    public virtual TurBitacora IdBitacoraNavigation { get; set; } = null!;

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("TurExtracciones")]
    public virtual InvMateriaPrima? IdMateriaPrimaNavigation { get; set; }
}
