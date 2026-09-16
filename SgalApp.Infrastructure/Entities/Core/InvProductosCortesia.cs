using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Tabla que guarda todos los productos de cortesía para los empleados. Ejemplo 1 americano y un espresso por día gratis.
/// </summary>
[Table("Inv_Productos_Cortesia")]
public partial class InvProductosCortesia
{
    [Key]
    [Column("Id_Producto_Cortesia")]
    public int IdProductoCortesia { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Cantidad_Diaria")]
    public int CantidadDiaria { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    public int Activo { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime")]
    public DateTime FechaModificacion { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvProductosCortesia")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;
}
