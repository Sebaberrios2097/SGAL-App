using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("SII_Contingencia_DTE")]
[Index(nameof(IdVenta), IsUnique = true, Name = "UX_SII_Contingencia_DTE_Venta")]
public sealed class SiiContingenciaDte
{
    [Key, Column("Id_Contingencia")]
    public int IdContingencia { get; set; }

    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    [Column("Id_Tipo_DTE")]
    public int IdTipoDte { get; set; }

    [Column("Estado"), MaxLength(20)]
    public string Estado { get; set; } = "pendiente";

    [Column("Motivo"), MaxLength(500)]
    public string Motivo { get; set; } = string.Empty;

    [Column("Fecha_Registro", TypeName = "datetime2")]
    public DateTime FechaRegistro { get; set; }

    [Column("Fecha_Regularizacion", TypeName = "datetime2")]
    public DateTime? FechaRegularizacion { get; set; }

    [Column("Id_Lote")]
    public int? IdLote { get; set; }

    [ForeignKey(nameof(IdVenta))]
    public VenVentas IdVentaNavigation { get; set; } = null!;

    [ForeignKey(nameof(IdLote))]
    public SiiContingenciaLote? IdLoteNavigation { get; set; }
}

[Table("SII_Contingencia_Lote")]
public sealed class SiiContingenciaLote
{
    [Key, Column("Id_Lote")]
    public int IdLote { get; set; }

    [Column("Id_Tipo_DTE")]
    public int IdTipoDte { get; set; }

    [Column("Folio")]
    public int Folio { get; set; }

    [Column("Track_Id")]
    public long? TrackId { get; set; }

    [Column("Estado"), MaxLength(20)]
    public string Estado { get; set; } = "emitido";

    [Column("Cantidad_Ventas")]
    public int CantidadVentas { get; set; }

    [Column("Monto_Total")]
    public int MontoTotal { get; set; }

    [Column("Desde", TypeName = "datetime2")]
    public DateTime Desde { get; set; }

    [Column("Hasta", TypeName = "datetime2")]
    public DateTime Hasta { get; set; }

    [Column("Fecha_Emision", TypeName = "datetime2")]
    public DateTime FechaEmision { get; set; }

    [Column("Xml_Firmado")]
    public byte[] XmlFirmado { get; set; } = [];

    public ICollection<SiiContingenciaDte> Ventas { get; set; } = new List<SiiContingenciaDte>();
}
