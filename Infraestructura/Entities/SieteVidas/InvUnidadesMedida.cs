using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Unidades_Medida")]
public partial class InvUnidadesMedida
{
    [Key]
    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [Column("Nombre_Unidad_Medida")]
    [StringLength(50)]
    public string NombreUnidadMedida { get; set; } = null!;

    [StringLength(15)]
    public string Abreviacion { get; set; } = null!;

    [Column("Tipo_Magnitud")]
    [StringLength(20)]
    public string TipoMagnitud { get; set; } = null!;

    [Column("Factor_Conversion_Base", TypeName = "decimal(18,6)")]
    public decimal FactorConversionBase { get; set; }

    [Column("Es_Unidad_Base")]
    public bool EsUnidadBase { get; set; }

    [InverseProperty("IdUnidadMedidaNavigation")]
    public virtual ICollection<InvMateriaPrima> InvMateriaPrima { get; set; } = new List<InvMateriaPrima>();

    [InverseProperty("IdUnidadMedidaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesReceta { get; set; } = new List<InvMaterialesReceta>();

    [InverseProperty("IdUnidadMedidaNavigation")]
    public virtual ICollection<InvPresentacionesMateriaPrima> InvPresentacionesMateriaPrima { get; set; } = new List<InvPresentacionesMateriaPrima>();

    /// <summary>Materias primas que usan esta unidad para su consumo como ingrediente extra.</summary>
    [InverseProperty("IdUnidadIngredienteExtraNavigation")]
    public virtual ICollection<InvMateriaPrima> InvMateriaPrimaComoUnidadExtra { get; set; } = new List<InvMateriaPrima>();
}
