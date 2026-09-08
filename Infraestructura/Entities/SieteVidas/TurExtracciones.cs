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

    public double Gramos { get; set; }

    public int Segundos { get; set; }

    public double Mililitros { get; set; }

    [StringLength(300)]
    public string? Observaciones { get; set; }

    [ForeignKey("IdBitacora")]
    [InverseProperty("TurExtracciones")]
    public virtual TurBitacora IdBitacoraNavigation { get; set; } = null!;
}
