using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("SII_Clientes_Empresa")]
public partial class SiiClientesEmpresa
{
    [Key]
    [Column("Id_Cliente_Empresa")]
    public int IdClienteEmpresa { get; set; }

    /// <summary>
    /// Rut con guion y dígito verificador
    /// </summary>
    [Column("Rut_Empresa")]
    [StringLength(12)]
    public string RutEmpresa { get; set; } = null!;

    /// <summary>
    /// Nombre legal de la empresa
    /// </summary>
    [Column("Razon_Social")]
    [StringLength(150)]
    public string RazonSocial { get; set; } = null!;

    /// <summary>
    /// Actividad económica obligatoria para el DTE
    /// </summary>
    [StringLength(100)]
    public string Giro { get; set; } = null!;

    /// <summary>
    /// Dirección comercial
    /// </summary>
    [Column("Direccion_Legal")]
    [StringLength(150)]
    public string DireccionLegal { get; set; } = null!;

    [StringLength(50)]
    public string Comuna { get; set; } = null!;

    [StringLength(50)]
    public string Ciudad { get; set; } = null!;

    [InverseProperty("IdClienteEmpresaNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
