using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Ven_Estados_Ventas")]
public partial class VenEstadosVentas
{
    [Key]
    [Column("Id_Estado_Venta")]
    public int IdEstadoVenta { get; set; }

    [Column("Nombre_Estado_Venta")]
    [StringLength(50)]
    public string NombreEstadoVenta { get; set; } = null!;

    [InverseProperty("IdEstadoVentaNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
