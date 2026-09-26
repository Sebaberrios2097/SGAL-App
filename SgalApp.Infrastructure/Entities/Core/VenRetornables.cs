using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Productos_Retornables")]
public class VenProductoRetornable
{
    [Key, Column("Id_Producto")]
    public int IdProducto { get; set; }
    [Column("Precio_Envase")]
    public int? PrecioEnvase { get; set; }
    [Column("Medio_Pago"), StringLength(12)]
    public string? MedioPago { get; set; }
    public bool Activo { get; set; } = true;
    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
    [ForeignKey(nameof(IdProducto))]
    public InvProductos Producto { get; set; } = null!;
}

[Table("Ven_Vales_Envases")]
public class VenValeEnvase
{
    [Key, Column("Id_Vale_Envase")]
    public int IdValeEnvase { get; set; }
    [StringLength(40)] public string Codigo { get; set; } = null!;
    [Column("Id_Venta")] public int IdVenta { get; set; }
    [Column("Id_Vale_Origen")] public int? IdValeOrigen { get; set; }
    [Column("Id_Vale_Padre")] public int? IdValePadre { get; set; }
    [Column("Fecha_Emision")] public DateTime FechaEmision { get; set; }
    [Column("Fecha_Vencimiento")] public DateTime? FechaVencimiento { get; set; }
    [Column("Fecha_Canje")] public DateTime? FechaCanje { get; set; }
    [Column("Id_Turno_Canje")] public int? IdTurnoCanje { get; set; }
    [Column("Id_Usuario_Canje")] public int? IdUsuarioCanje { get; set; }
    [Column("Monto_Original")] public int MontoOriginal { get; set; }
    [Column("Monto_Canjeado")] public int MontoCanjeado { get; set; }
    [StringLength(12)] public string Estado { get; set; } = "VIGENTE";
    public ICollection<VenValeEnvaseDetalle> Detalles { get; set; } = [];
}

[Table("Ven_Vales_Envases_Detalle")]
public class VenValeEnvaseDetalle
{
    [Key, Column("Id_Vale_Envase_Detalle")]
    public int IdValeEnvaseDetalle { get; set; }
    [Column("Id_Vale_Envase")] public int IdValeEnvase { get; set; }
    [Column("Id_Producto")] public int IdProducto { get; set; }
    public int Cantidad { get; set; }
    [Column("Precio_Unitario")] public int PrecioUnitario { get; set; }
    [ForeignKey(nameof(IdValeEnvase))] public VenValeEnvase Vale { get; set; } = null!;
    [ForeignKey(nameof(IdProducto))] public InvProductos Producto { get; set; } = null!;
}
