using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Promocion_Grupos")]
public class VenPromocionGrupos
{
    [Key, Column("Id_Grupo")]
    public int IdGrupo { get; set; }

    [Column("Id_Promocion")]
    public int IdPromocion { get; set; }

    /// <summary>Grupo base (productos fijos) o excluyente (se elige Cantidad_Elegir opciones).</summary>
    [Column("Es_Base")]
    public bool EsBase { get; set; }

    [Column("Nombre"), StringLength(120)]
    public string Nombre { get; set; } = null!;

    /// <summary>En grupos excluyentes, cuántas opciones se eligen (con repetición permitida).</summary>
    [Column("Cantidad_Elegir")]
    public int CantidadElegir { get; set; } = 1;

    [Column("Orden")]
    public int Orden { get; set; }

    [ForeignKey("IdPromocion")]
    [InverseProperty("Grupos")]
    public virtual VenPromociones IdPromocionNavigation { get; set; } = null!;

    [InverseProperty("IdGrupoNavigation")]
    public virtual ICollection<VenPromocionGrupoProductos> Productos { get; set; } = new List<VenPromocionGrupoProductos>();
}
