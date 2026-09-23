using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Un documento tributario emitido (o por emitir) para una venta. Es 1:N con la venta porque
/// una misma venta puede tener su documento principal (boleta/factura) y, si se anula, su
/// nota de crédito (61) que lo referencia. El estado de aceptación del SII vive en
/// <see cref="IdEstadoBoleta"/>; los blobs (XML/PDF) se mantienen fuera de las proyecciones
/// normales de venta para no pesar en las consultas de siempre.
/// </summary>
[Table("SII_Dte_Emision")]
[Index(nameof(IdVenta), nameof(IdTipoDte), IsUnique = true, Name = "UX_SII_Dte_Emision_Venta_Tipo")]
public partial class SiiDteEmision
{
    [Key]
    [Column("Id_Emision")]
    public int IdEmision { get; set; }

    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    /// <summary>Tipo de DTE de ESTE documento (39/41/33/34/61).</summary>
    [Column("Id_Tipo_DTE")]
    public int IdTipoDte { get; set; }

    /// <summary>Estado SII de este documento (Pendiente/Enviado/Aceptado/Rechazado/…).</summary>
    [Column("Id_Estado_Boleta")]
    public int IdEstadoBoleta { get; set; }

    /// <summary>Folio asignado por LibreDTE desde el CAF (null hasta emitir con éxito).</summary>
    [Column("Folio")]
    public int? Folio { get; set; }

    /// <summary>Track ID de seguimiento entregado por el SII.</summary>
    [Column("Track_Id")]
    public long? TrackId { get; set; }

    [Column("Monto_Neto")]
    public int MontoNeto { get; set; }

    [Column("Monto_Exento")]
    public int MontoExento { get; set; }

    [Column("Monto_IVA")]
    public int MontoIva { get; set; }

    [Column("Monto_Total")]
    public int MontoTotal { get; set; }

    [Column("Xml_Firmado")]
    public byte[]? XmlFirmado { get; set; }

    [Column("Pdf")]
    public byte[]? Pdf { get; set; }

    [Column("Fecha_Emision", TypeName = "datetime")]
    public DateTime? FechaEmision { get; set; }

    [Column("Fecha_Actualizacion", TypeName = "datetime")]
    public DateTime FechaActualizacion { get; set; }

    [Column("Ultimo_Error")]
    public string? UltimoError { get; set; }

    [Column("Reintentos")]
    public int Reintentos { get; set; }

    /// <summary>Para una nota de crédito (61): la emisión del documento que anula.</summary>
    [Column("Id_Emision_Referencia")]
    public int? IdEmisionReferencia { get; set; }

    [ForeignKey(nameof(IdVenta))]
    [InverseProperty("SiiDteEmision")]
    public virtual VenVentas IdVentaNavigation { get; set; } = null!;

    [ForeignKey(nameof(IdTipoDte))]
    public virtual SiiTiposDte IdTipoDteNavigation { get; set; } = null!;

    [ForeignKey(nameof(IdEstadoBoleta))]
    public virtual SiiEstadosBoleta IdEstadoBoletaNavigation { get; set; } = null!;

    [ForeignKey(nameof(IdEmisionReferencia))]
    [InverseProperty(nameof(NotasCredito))]
    public virtual SiiDteEmision? IdEmisionReferenciaNavigation { get; set; }

    [InverseProperty(nameof(IdEmisionReferenciaNavigation))]
    public virtual ICollection<SiiDteEmision> NotasCredito { get; set; } = new List<SiiDteEmision>();
}
