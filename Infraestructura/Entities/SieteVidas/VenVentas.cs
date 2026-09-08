using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Ven_Ventas")]
public partial class VenVentas
{
    [Key]
    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    [Column("Id_Turno")]
    public int IdTurno { get; set; }

    [Column("Id_Estado_Venta")]
    public int IdEstadoVenta { get; set; }

    [Column("Id_Tipo_DTE")]
    public int? IdTipoDte { get; set; }

    [Column("Id_Cliente_Empresa")]
    public int? IdClienteEmpresa { get; set; }

    [Column("Id_Estado_Boleta")]
    public int? IdEstadoBoleta { get; set; }

    [Column("Fecha_Venta", TypeName = "datetime")]
    public DateTime FechaVenta { get; set; }

    [Column("Monto_Total")]
    public int MontoTotal { get; set; }

    [Column("Correlativo_Diario")]
    public int? CorrelativoDiario { get; set; }

    [Column("Folio_DTE")]
    public int? FolioDte { get; set; }

    [Column("Monto_Neto")]
    public int? MontoNeto { get; set; }

    [Column("Monto_IVA")]
    public int? MontoIva { get; set; }

    [ForeignKey("IdClienteEmpresa")]
    [InverseProperty("VenVentas")]
    public virtual SiiClientesEmpresa? IdClienteEmpresaNavigation { get; set; }

    [ForeignKey("IdEstadoBoleta")]
    [InverseProperty("VenVentas")]
    public virtual SiiEstadosBoleta? IdEstadoBoletaNavigation { get; set; }

    [ForeignKey("IdEstadoVenta")]
    [InverseProperty("VenVentas")]
    public virtual VenEstadosVentas IdEstadoVentaNavigation { get; set; } = null!;

    [ForeignKey("IdTipoDte")]
    [InverseProperty("VenVentas")]
    public virtual SiiTiposDte? IdTipoDteNavigation { get; set; }

    [ForeignKey("IdTurno")]
    [InverseProperty("VenVentas")]
    public virtual TurTurno IdTurnoNavigation { get; set; } = null!;

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenMetodosPagoVenta> VenMetodosPagoVenta { get; set; } = new List<VenMetodosPagoVenta>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenOrdenesPoint> VenOrdenesPoint { get; set; } = new List<VenOrdenesPoint>();
}
