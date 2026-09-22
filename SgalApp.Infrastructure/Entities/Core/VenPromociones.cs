using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Promociones")]
public class VenPromociones
{
    [Key, Column("Id_Promocion")]
    public int IdPromocion { get; set; }

    [Column("Nombre"), StringLength(150)]
    public string Nombre { get; set; } = null!;

    public int Precio { get; set; }

    [Column("Descripcion"), StringLength(300)]
    public string? Descripcion { get; set; }

    [Column("Fecha_Inicio", TypeName = "datetime")]
    public DateTime? FechaInicio { get; set; }

    [Column("Fecha_Fin", TypeName = "datetime")]
    public DateTime? FechaFin { get; set; }

    public bool Activo { get; set; } = true;

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [InverseProperty("IdPromocionNavigation")]
    public virtual ICollection<VenPromocionGrupos> Grupos { get; set; } = new List<VenPromocionGrupos>();
}
