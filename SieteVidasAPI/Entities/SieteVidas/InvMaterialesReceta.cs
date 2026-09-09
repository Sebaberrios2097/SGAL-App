using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Inv_Materiales_Receta")]
[Index("IdReceta", "IdMateriaPrima", Name = "UX_Inv_Materiales_Receta", IsUnique = true)]
public partial class InvMaterialesReceta
{
    [Key]
    [Column("Id_Material_Receta")]
    public int IdMaterialReceta { get; set; }

    [Column("Id_Receta")]
    public int IdReceta { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Requerida", TypeName = "decimal(18, 3)")]
    public decimal CantidadRequerida { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdReceta")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvRecetas IdRecetaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;
}
