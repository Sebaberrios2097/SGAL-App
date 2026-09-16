using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Estados_Ventas")]
public partial class VenEstadosVentas
{
    [Key]
    [Column("Id_Estado_Venta")]
    public int IdEstadoVenta { get; set; }

    [Column("Nombre_Estado_Venta")]
    [StringLength(50)]
    public string NombreEstadoVenta { get; set; } = null!;

    [InverseProperty("IdEstadoVentaNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
