using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Logos_Ubicaciones")]
public class OrgLogoUbicacion
{
    [Key, Column("Codigo_Ubicacion"), StringLength(40)]
    public string CodigoUbicacion { get; set; } = null!;

    [Column("Id_Logo")]
    public int IdLogo { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }

    [ForeignKey(nameof(IdLogo))]
    public OrgLogo Logo { get; set; } = null!;
}
