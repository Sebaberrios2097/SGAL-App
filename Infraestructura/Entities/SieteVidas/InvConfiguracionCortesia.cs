using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Configuracion_Cortesia")]
public partial class InvConfiguracionCortesia
{
    [Key]
    [Column("Id_Configuracion")]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int IdConfiguracion { get; set; }

    [Column("Limite_Diario_Global")]
    public int LimiteDiarioGlobal { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime2")]
    public DateTime FechaModificacion { get; set; }
}
