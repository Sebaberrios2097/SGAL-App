using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Tabla que guarda el desglose por método de pago al final del turno.
/// Si es efectivo, se debe calcula el monto total que haya en la tabla Tur_Turno_Desglose_Efectivo.
/// </summary>
[Table("Tur_Turno_Desglose")]
public partial class TurTurnoDesglose
{
    [Key]
    [Column("Id_Turno_Desglose")]
    public int IdTurnoDesglose { get; set; }

    [Column("Id_Turno")]
    public int IdTurno { get; set; }

    [Column("Id_Metodo_Pago")]
    public int IdMetodoPago { get; set; }

    [Column("Monto_Esperado")]
    public int MontoEsperado { get; set; }

    [Column("Monto_Real")]
    public int MontoReal { get; set; }

    [ForeignKey("IdMetodoPago")]
    [InverseProperty("TurTurnoDesglose")]
    public virtual VenMetodosPago IdMetodoPagoNavigation { get; set; } = null!;

    [ForeignKey("IdTurno")]
    [InverseProperty("TurTurnoDesglose")]
    public virtual TurTurno IdTurnoNavigation { get; set; } = null!;
}
