using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Logos")]
public class OrgLogo
{
    [Key, Column("Id_Logo")]
    public int IdLogo { get; set; }

    [StringLength(120)]
    public string Nombre { get; set; } = null!;

    [Column("Contenido")]
    public byte[] Contenido { get; set; } = null!;

    [Column("Tipo_Contenido"), StringLength(50)]
    public string TipoContenido { get; set; } = null!;

    [Column("Nombre_Archivo"), StringLength(180)]
    public string NombreArchivo { get; set; } = null!;

    [Column("Fecha_Creacion")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }

    public ICollection<OrgLogoUbicacion> Ubicaciones { get; set; } = new List<OrgLogoUbicacion>();
}
