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

    [InverseProperty("IdUnidadMedidaNavigation")]
    public virtual ICollection<InvMateriaPrima> InvMateriaPrima { get; set; } = new List<InvMateriaPrima>();
}
