using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Marcas")]
public partial class InvMarcas
{
    [Key]
    [Column("Id_Marca")]
    public int IdMarca { get; set; }

    [Column("Nombre_Marca")]
    [StringLength(100)]
    public string NombreMarca { get; set; } = null!;

    [InverseProperty("IdMarcaNavigation")]
    public virtual ICollection<InvMateriaPrima> InvMateriaPrima { get; set; } = new List<InvMateriaPrima>();
}
