using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Tur_Estados_Turnos")]
public partial class TurEstadosTurnos
{
    [Key]
    [Column("Id_Estado_Turno")]
    public int IdEstadoTurno { get; set; }

    [Column("Nombre_Estado_Turno")]
    [StringLength(50)]
    public string NombreEstadoTurno { get; set; } = null!;

    [InverseProperty("IdEstadoTurnoNavigation")]
    public virtual ICollection<TurTurno> TurTurno { get; set; } = new List<TurTurno>();
}
