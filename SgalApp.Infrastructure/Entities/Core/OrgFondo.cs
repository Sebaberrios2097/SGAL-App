using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Fondos")]
public class OrgFondo
{
    [Key, Column("Zona"), StringLength(40)]
    public string Zona { get; set; } = null!;

    public bool Habilitado { get; set; }

    [Column("Contenido")]
    public byte[]? Contenido { get; set; }

    [Column("Tipo_Contenido"), StringLength(50)]
    public string? TipoContenido { get; set; }

    [Column("Nombre_Archivo"), StringLength(180)]
    public string? NombreArchivo { get; set; }

    public int? Ancho { get; set; }

    public int? Alto { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
}
