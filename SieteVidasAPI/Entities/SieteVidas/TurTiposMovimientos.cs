using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Tur_Tipos_Movimientos")]
public partial class TurTiposMovimientos
{
    [Key]
    [Column("Id_Tipo_Movimiento")]
    public int IdTipoMovimiento { get; set; }

    [Column("Nombre_Tipo_Movimiento")]
    [StringLength(50)]
    public string NombreTipoMovimiento { get; set; } = null!;

    [InverseProperty("IdTipoMovimientoNavigation")]
    public virtual ICollection<TurTurnoDesgloseEfectivo> TurTurnoDesgloseEfectivo { get; set; } = new List<TurTurnoDesgloseEfectivo>();
}
