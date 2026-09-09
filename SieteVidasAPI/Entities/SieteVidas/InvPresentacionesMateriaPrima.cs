using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Inv_Presentaciones_Materia_Prima")]
[Index("IdMateriaPrima", "NombrePresentacion", Name = "UX_Inv_Presentaciones_Materia_Prima_Nombre", IsUnique = true)]
public partial class InvPresentacionesMateriaPrima
{
    [Key]
    [Column("Id_Presentacion_Materia_Prima")]
    public int IdPresentacionMateriaPrima { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [Column("Nombre_Presentacion")]
    [StringLength(100)]
    public string NombrePresentacion { get; set; } = null!;

    [Column("Cantidad_Contenido", TypeName = "decimal(18, 3)")]
    public decimal CantidadContenido { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Creacion")]
    public DateTime FechaCreacion { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("InvPresentacionesMateriaPrima")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvPresentacionesMateriaPrima")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;
}
