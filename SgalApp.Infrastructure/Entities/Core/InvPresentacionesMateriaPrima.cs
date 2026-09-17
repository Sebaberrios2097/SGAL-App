using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Presentaciones_Materia_Prima")]
public partial class InvPresentacionesMateriaPrima
{
    [Key]
    [Column("Id_Presentacion_Materia_Prima")]
    public int IdPresentacionMateriaPrima { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [Column("Id_Formato_Compra")]
    public int? IdFormatoCompra { get; set; }

    [Column("Nombre_Presentacion")]
    [StringLength(100)]
    public string NombrePresentacion { get; set; } = null!;

    [Column("Cantidad_Contenido", TypeName = "decimal(18,3)")]
    public decimal CantidadContenido { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime2")]
    public DateTime FechaCreacion { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvPresentacionesMateriaPrima")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvPresentacionesMateriaPrima")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;

    [ForeignKey("IdFormatoCompra")]
    public virtual InvFormatosCompra? IdFormatoCompraNavigation { get; set; }
}
