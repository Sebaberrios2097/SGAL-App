using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Promocion_Grupo_Productos")]
public class VenPromocionGrupoProductos
{
    [Key, Column("Id_Grupo_Producto")]
    public int IdGrupoProducto { get; set; }

    [Column("Id_Grupo")]
    public int IdGrupo { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    /// <summary>Cantidad incluida (grupo base). En excluyentes, cantidad por selección.</summary>
    public int Cantidad { get; set; } = 1;

    [ForeignKey("IdGrupo")]
    [InverseProperty("Productos")]
    public virtual VenPromocionGrupos IdGrupoNavigation { get; set; } = null!;

    [ForeignKey("IdProducto")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;
}
