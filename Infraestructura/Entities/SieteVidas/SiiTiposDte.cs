using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("SII_Tipos_DTE")]
public partial class SiiTiposDte
{
    /// <summary>
    /// Código oficial del SII.
    /// </summary>
    [Key]
    [Column("Id_Tipo_DTE")]
    public int IdTipoDte { get; set; }

    [Column("Nombre_DTE")]
    [StringLength(50)]
    public string NombreDte { get; set; } = null!;

    [Column("Es_Facturable")]
    public bool EsFacturable { get; set; }

    [InverseProperty("IdTipoDteNavigation")]
    public virtual ICollection<SiiCafFolios> SiiCafFolios { get; set; } = new List<SiiCafFolios>();

    [InverseProperty("IdTipoDteNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
