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

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdReceta")]
    [InverseProperty("InvMaterialesReceta")]
    public virtual InvRecetas IdRecetaNavigation { get; set; } = null!;
}
