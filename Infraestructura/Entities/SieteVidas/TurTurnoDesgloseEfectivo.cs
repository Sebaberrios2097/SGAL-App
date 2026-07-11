using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Tabla que guarda el desglose de efectivo tanto al inicio como al fin del turno. Permite saber con cuánto dinero de cada denominación se inició el turno y con cuánto se terminó.
/// </summary>
[Table("Tur_Turno_Desglose_Efectivo")]
public partial class TurTurnoDesgloseEfectivo
{
    [Key]
    [Column("Id_Turno_Desglose_Efectivo")]
    public int IdTurnoDesgloseEfectivo { get; set; }

    [Column("Id_Turno")]
    public int IdTurno { get; set; }

    [Column("Id_Denominacion")]
    public int IdDenominacion { get; set; }

    [Column("Id_Tipo_Movimiento")]
    public int IdTipoMovimiento { get; set; }

    public int Cantidad { get; set; }

    [ForeignKey("IdDenominacion")]
    [InverseProperty("TurTurnoDesgloseEfectivo")]
    public virtual TurDenominaciones IdDenominacionNavigation { get; set; } = null!;

    [ForeignKey("IdTipoMovimiento")]
    [InverseProperty("TurTurnoDesgloseEfectivo")]
    public virtual TurTiposMovimientos IdTipoMovimientoNavigation { get; set; } = null!;

    [ForeignKey("IdTurno")]
    [InverseProperty("TurTurnoDesgloseEfectivo")]
    public virtual TurTurno IdTurnoNavigation { get; set; } = null!;
}
