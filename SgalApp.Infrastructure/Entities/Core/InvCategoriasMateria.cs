using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Categorias_Materia")]
public partial class InvCategoriasMateria
{
    [Key]
    [Column("Id_Categoria_Materia")]
    public int IdCategoriaMateria { get; set; }

    [Column("Nombre_Categoria_Materia")]
    [StringLength(100)]
    public string NombreCategoriaMateria { get; set; } = null!;

    [InverseProperty("IdCategoriaMateriaNavigation")]
    public virtual ICollection<InvMateriaPrima> InvMateriaPrima { get; set; } = new List<InvMateriaPrima>();
}
