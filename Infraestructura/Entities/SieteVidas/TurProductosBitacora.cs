using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

/// <summary>
/// Tabla que guarda los productos consumidos por el empleado.
/// </summary>
[Table("Tur_Productos_Bitacora")]
public partial class TurProductosBitacora
{
    [Key]
    [Column("Id_Productos_Bitacora")]
    public int IdProductosBitacora { get; set; }

    [Column("Id_Bitacora")]
    public int IdBitacora { get; set; }

    [Column("Id_Producto")]
    public int IdProducto { get; set; }

    [Column("Es_Cortesia")]
    public bool EsCortesia { get; set; }

    [ForeignKey("IdBitacora")]
    [InverseProperty("TurProductosBitacora")]
    public virtual TurBitacora IdBitacoraNavigation { get; set; } = null!;

    [ForeignKey("IdProducto")]
    [InverseProperty("TurProductosBitacora")]
    public virtual InvProductos IdProductoNavigation { get; set; } = null!;
}
