using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Materiales_Receta")]
public partial class InvMaterialesReceta
{
    [Key]
    [Column("Id_Material_Receta")]
    public int IdMaterialReceta { get; set; }

    [Column("Id_Receta")]
    public int IdReceta { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Requerida", TypeName = "decimal(18,3)")]
    public decimal CantidadRequerida { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [Column("Id_Materia_Prima_Reemplazada")]
    public int? IdMateriaPrimaReemplazada { get; set; }

    public int Recargo { get; set; }

    [Column("Usa_Misma_Medida_Que_Principal")]
    public bool UsaMismaMedidaQuePrincipal { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdMateriaPrimaReemplazada")]
    [InverseProperty("InvMaterialesRecetaComoMateriaBase")]
    public virtual InvMateriaPrima? IdMateriaPrimaReemplazadaNavigation { get; set; }

    [ForeignKey("IdReceta")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvRecetas IdRecetaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;
}
