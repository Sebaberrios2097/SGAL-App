using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Tur_Bitacora")]
public partial class TurBitacora
{
    [Key]
    [Column("Id_Bitacora")]
    public int IdBitacora { get; set; }

    [Column("Id_Turno")]
    public int IdTurno { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [StringLength(1000)]
    public string? Observaciones { get; set; }

    [ForeignKey("IdTurno")]
    [InverseProperty("TurBitacora")]
    public virtual TurTurno IdTurnoNavigation { get; set; } = null!;

    [InverseProperty("IdBitacoraNavigation")]
    public virtual ICollection<TurExtracciones> TurExtracciones { get; set; } = new List<TurExtracciones>();

    [InverseProperty("IdBitacoraNavigation")]
    public virtual ICollection<TurProductosBitacora> TurProductosBitacora { get; set; } = new List<TurProductosBitacora>();

    /// <summary>Ventas de consumo del empleado asociadas a esta bitácora (por cobrar).</summary>
    [InverseProperty("IdBitacoraNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
