using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

/// <summary>
/// Almacena denominaciones de dinero (ej. billete de 1000 pesos, moneda de 10 pesos, moneda de 500 pesos, etc.)
/// </summary>
[Table("Tur_Denominaciones")]
public partial class TurDenominaciones
{
    [Key]
    [Column("Id_Denominacion")]
    public int IdDenominacion { get; set; }

    public int Valor { get; set; }

    [Column("Es_Moneda")]
    public bool EsMoneda { get; set; }

    [StringLength(50)]
    public string? Descripcion { get; set; }

    [InverseProperty("IdDenominacionNavigation")]
    public virtual ICollection<TurTurnoDesgloseEfectivo> TurTurnoDesgloseEfectivo { get; set; } = new List<TurTurnoDesgloseEfectivo>();
}
