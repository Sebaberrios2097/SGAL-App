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

    /// <summary>
    /// Marca la materia prima como el café cuya cantidad en las recetas se toma de la última
    /// calibración (extracción) del turno abierto, en lugar de una cantidad fija. Solo una
    /// materia prima puede estar marcada a la vez.
    /// </summary>
    [Column("Es_Cafe_Calibrable")]
    public bool EsCafeCalibrable { get; set; }

    /// <summary>
    /// Marca la materia prima como no controlada en inventario (p. ej. el agua). No exige
    /// existencia al crearla y las recetas que la usen no descuentan stock durante la venta,
    /// los ingredientes extra ni los consumos de bitácora. Excluyente con <see cref="EsCafeCalibrable"/>.
    /// </summary>
    [Column("No_Descuenta_Inventario")]
    public bool NoDescuentaInventario { get; set; }

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
    public virtual ICollection<InvIngredientesExtra> InvIngredientesExtra { get; set; } = new List<InvIngredientesExtra>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<InvOrdenDetalle> InvOrdenDetalle { get; set; } = new List<InvOrdenDetalle>();

    [InverseProperty("IdMateriaPrimaReemplazadaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesRecetaComoMateriaBase { get; set; } = new List<InvMaterialesReceta>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<InvPresentacionesMateriaPrima> InvPresentacionesMateriaPrima { get; set; } = new List<InvPresentacionesMateriaPrima>();

    public virtual ICollection<TurProductosBitacoraMateriales> TurProductosBitacoraMateriales { get; set; } = new List<TurProductosBitacoraMateriales>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<TurExtracciones> TurExtracciones { get; set; } = new List<TurExtracciones>();

    [InverseProperty("IdMateriaPrimaNavigation")]
    public virtual ICollection<VenDetalleVentaMateriales> VenDetalleVentaMateriales { get; set; } = new List<VenDetalleVentaMateriales>();
}
