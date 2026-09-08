using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Materia_Prima")]
public partial class InvMateriaPrima
{
    [Key]
    [Column("Id_Materia_Prima")]
    public int IdMateriaPrima { get; set; }

    [Column("Id_Marca")]
    public int IdMarca { get; set; }

    [Column("Id_Categoria_Materia")]
    public int IdCategoriaMateria { get; set; }

    [Column("Id_Unidad_Medida")]
    public int IdUnidadMedida { get; set; }

    [Column("Nombre_Material")]
    [StringLength(150)]
    public string NombreMaterial { get; set; } = null!;

    public byte[]? Imagen { get; set; }

    [StringLength(300)]
    public string? Descripcion { get; set; }

    [Column(TypeName = "decimal(18,3)")]
    public decimal Cantidad { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [ForeignKey("IdCategoriaMateria")]
    [InverseProperty("InvMateriaPrima")]
    public virtual InvCategoriasMateria IdCategoriaMateriaNavigation { get; set; } = null!;

    [ForeignKey("IdMarca")]
    [InverseProperty("InvMateriaPrima")]
    public virtual InvMarcas IdMarcaNavigation { get; set; } = null!;

    [ForeignKey("IdUnidadMedida")]
    [InverseProperty("InvMateriaPrima")]
    public virtual InvUnidadesMedida IdUnidadMedidaNavigation { get; set; } = null!;

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesReceta { get; set; } = new List<InvMaterialesReceta>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<InvPresentacionesMateriaPrima> InvPresentacionesMateriaPrima { get; set; } = new List<InvPresentacionesMateriaPrima>();

    public virtual ICollection<TurProductosBitacoraMateriales> TurProductosBitacoraMateriales { get; set; } = new List<TurProductosBitacoraMateriales>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<VenDetalleVentaMateriales> VenDetalleVentaMateriales { get; set; } = new List<VenDetalleVentaMateriales>();
}
