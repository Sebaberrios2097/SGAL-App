using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Inv_Descuentos_Productos")]
public partial class InvDescuentosProductos
{
    [Key]
    [Column("Id_Descuento_Producto")]
    public int IdDescuentoProducto { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Porcentaje_Descuento", TypeName = "decimal(18, 0)")]
    public decimal PorcentajeDescuento { get; set; }

    [Column("Fecha_Inicio_Descuento", TypeName = "datetime")]
    public DateTime FechaInicioDescuento { get; set; }

    [Column("Fecha_Termino_Descuento", TypeName = "datetime")]
    public DateTime? FechaTerminoDescuento { get; set; }

    [Column("Fecha_Registro", TypeName = "datetime")]
    public DateTime FechaRegistro { get; set; }

    public bool Activo { get; set; }

    [ForeignKey("IdProducto")]
    [InverseProperty("InvDescuentosProductos")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;
}
