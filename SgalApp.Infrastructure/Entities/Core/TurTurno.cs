using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Tur_Turno")]
public partial class TurTurno
{
    [Key]
    [Column("Id_Turno")]
    public int IdTurno { get; set; }

    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    [Column("Id_Estado_Turno")]
    public int IdEstadoTurno { get; set; }

    /// <summary>Tipo de turno: 1 = vendedor (genera órdenes), 2 = caja (cobra).</summary>
    [Column("Tipo_Turno")]
    public byte TipoTurno { get; set; } = 1;

    [Column("Fecha_Apertura", TypeName = "datetime")]
    public DateTime FechaApertura { get; set; }

    [Column("Fecha_Cierre", TypeName = "datetime")]
    public DateTime? FechaCierre { get; set; }

    /// <summary>
    /// Indica la cuadratura general del turno incluyendo todos los métodos de pago: si es negativo faltó dinero, si es positivo sobró. 
    /// Todos los detalles se encontrarán en la tabla Tur_Turno_Desglose.
    /// </summary>
    [Column("Diferencia_Total")]
    public int? DiferenciaTotal { get; set; }

    [Column("Observacion_Cierre")]
    public int? ObservacionCierre { get; set; }

    [ForeignKey("IdEstadoTurno")]
    [InverseProperty("TurTurno")]
    public virtual TurEstadosTurnos IdEstadoTurnoNavigation { get; set; } = null!;

    [ForeignKey("IdUsuario")]
    [InverseProperty("TurTurno")]
    public virtual EmpUsuarios IdUsuarioNavigation { get; set; } = null!;

    [InverseProperty("IdTurnoNavigation")]
    public virtual ICollection<TurBitacora> TurBitacora { get; set; } = new List<TurBitacora>();

    [InverseProperty("IdTurnoNavigation")]
    public virtual ICollection<TurTurnoDesglose> TurTurnoDesglose { get; set; } = new List<TurTurnoDesglose>();

    [InverseProperty("IdTurnoNavigation")]
    public virtual ICollection<TurTurnoDesgloseEfectivo> TurTurnoDesgloseEfectivo { get; set; } = new List<TurTurnoDesgloseEfectivo>();

    [InverseProperty("IdTurnoNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();

    /// <summary>Ventas cobradas en este turno de caja (módulo Caja).</summary>
    [InverseProperty("IdTurnoCajaNavigation")]
    public virtual ICollection<VenVentas> VenVentasCaja { get; set; } = new List<VenVentas>();
}
