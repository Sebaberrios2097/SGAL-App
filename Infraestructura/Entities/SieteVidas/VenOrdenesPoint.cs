using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Infraestructura.Entities.SieteVidas;

[Table("Ven_Ordenes_Point")]
public partial class VenOrdenesPoint
{
    [Key]
    [Column("Id_Orden_Point")]
    public int IdOrdenPoint { get; set; }

    [Column("Id_Orden_MP")]
    [StringLength(64)]
    [Unicode(false)]
    public string IdOrdenMp { get; set; } = null!;

    [Column("Referencia_Externa")]
    [StringLength(64)]
    [Unicode(false)]
    public string ReferenciaExterna { get; set; } = null!;

    [Column("Id_Venta")]
    public int? IdVenta { get; set; }

    [Column("Id_Terminal")]
    [StringLength(100)]
    [Unicode(false)]
    public string IdTerminal { get; set; } = null!;

    [Column("Monto")]
    public int Monto { get; set; }

    [Column("Estado")]
    [StringLength(30)]
    [Unicode(false)]
    public string Estado { get; set; } = null!;

    [Column("Detalle_Estado")]
    [StringLength(50)]
    [Unicode(false)]
    public string? DetalleEstado { get; set; }

    [Column("Id_Pago_MP")]
    [StringLength(64)]
    [Unicode(false)]
    public string? IdPagoMp { get; set; }

    [Column("Tipo_Medio_Pago")]
    [StringLength(30)]
    [Unicode(false)]
    public string? TipoMedioPago { get; set; }

    [Column("Marca_Tarjeta")]
    [StringLength(30)]
    [Unicode(false)]
    public string? MarcaTarjeta { get; set; }

    [Column("Cuotas")]
    public int? Cuotas { get; set; }

    [Column("Monto_Pagado")]
    public int? MontoPagado { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Actualizacion", TypeName = "datetime")]
    public DateTime FechaActualizacion { get; set; }

    [ForeignKey("IdVenta")]
    [InverseProperty("VenOrdenesPoint")]
    public virtual VenVentas? IdVentaNavigation { get; set; }
}
