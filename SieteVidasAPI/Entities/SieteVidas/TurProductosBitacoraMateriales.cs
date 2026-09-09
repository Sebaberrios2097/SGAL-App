using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Tur_Productos_Bitacora_Materiales")]
public partial class TurProductosBitacoraMateriales
{
    [Key]
    [Column("Id_Producto_Bitacora_Material")]
    public int IdProductoBitacoraMaterial { get; set; }

    [Column("Id_Productos_Bitacora")]
    public int IdProductosBitacora { get; set; }

    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Cantidad_Descontada", TypeName = "decimal(18, 3)")]
    public decimal CantidadDescontada { get; set; }

    [ForeignKey("IdMateriaPrima")]
    [InverseProperty("TurProductosBitacoraMateriales")]
    public virtual InvMateriaPrima IdMateriaPrimaNavigation { get; set; } = null!;

    [ForeignKey("IdProductosBitacora")]
    [InverseProperty("TurProductosBitacoraMateriales")]
    public virtual TurProductosBitacora IdProductosBitacoraNavigation { get; set; } = null!;
}
