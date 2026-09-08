using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Recetas")]
public partial class InvRecetas
{
    [Key]
    [Column("Id_Receta")]
    public int IdReceta { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    public bool Estado { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvRecetas")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;

    [InverseProperty("IdRecetaNavigation")]
    public virtual ICollection<InvMaterialesReceta> InvMaterialesReceta { get; set; } = new List<InvMaterialesReceta>();
}
