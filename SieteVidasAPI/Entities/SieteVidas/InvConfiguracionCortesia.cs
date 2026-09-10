using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Inv_Configuracion_Cortesia")]
public partial class InvConfiguracionCortesia
{
    [Key]
    [Column("Id_Configuracion")]
    public int IdConfiguracion { get; set; }

    [Column("Limite_Diario_Global")]
    public int LimiteDiarioGlobal { get; set; }

    [Column("Fecha_Modificacion")]
    public DateTime FechaModificacion { get; set; }
}
