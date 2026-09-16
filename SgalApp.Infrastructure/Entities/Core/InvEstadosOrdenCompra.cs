using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Estados_Orden_Compra")]
public partial class InvEstadosOrdenCompra
{
    [Key]
    [Column("Id_Estado_Orden_Compra")]
    public int IdEstadoOrdenCompra { get; set; }

    [Column("Nombre_Estado_Orden_Compra")]
    [StringLength(50)]
    public string NombreEstadoOrdenCompra { get; set; } = null!;

    [InverseProperty("IdEstadoOrdenCompraNavigation")]
    public virtual ICollection<InvOrdenCompra> InvOrdenCompra { get; set; } = new List<InvOrdenCompra>();
}
