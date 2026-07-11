using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Proveedores")]
public partial class InvProveedores
{
    [Key]
    [Column("Id_Proveedor")]
    public int IdProveedor { get; set; }

    [Column("Nombre_Proveedor")]
    [StringLength(150)]
    public string NombreProveedor { get; set; } = null!;

    public bool Activo { get; set; }

    [InverseProperty("IdProveedorNavigation")]
    public virtual ICollection<InvOrdenCompra> InvOrdenCompra { get; set; } = new List<InvOrdenCompra>();
}
