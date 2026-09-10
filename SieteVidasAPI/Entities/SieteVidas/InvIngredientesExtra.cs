using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Inv_Ingredientes_Extra")]
public partial class InvIngredientesExtra
{
    [Key]
    [Column("Id_Ingrediente_Extra")]
    public int IdIngredienteExtra { get; set; }

    [Column("Nombre_Ingrediente_Extra")]
    [StringLength(50)]
    public string NombreIngredienteExtra { get; set; } = null!;

    [StringLength(150)]
    public string? Descripcion { get; set; }

    public int Precio { get; set; }

    public bool Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime? FechaModificacion { get; set; }

    [InverseProperty("IdIngredienteExtraNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();
}
