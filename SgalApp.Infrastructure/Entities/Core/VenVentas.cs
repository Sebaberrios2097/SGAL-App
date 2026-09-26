using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Ven_Ventas")]
public partial class VenVentas
{
    [Key]
    [Column("Id_Venta")]
    public int IdVenta { get; set; }

    [Column("Id_Turno")]
    public int? IdTurno { get; set; }

    /// <summary>
    /// Turno de caja donde se cobró la venta (módulo Caja). NULL mientras el vale está
    /// pendiente de pago o cuando el cobro ocurre en la misma venta (sin módulo Caja).
    /// </summary>
    [Column("Id_Turno_Caja")]
    public int? IdTurnoCaja { get; set; }

    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    /// <summary>
    /// Si != null, la venta es un "consumo de empleado" asociado a esta bitácora (por cobrar al
    /// empleado); no forma parte de los ingresos/efectivo normales del turno.
    /// </summary>
    [Column("Id_Bitacora")]
    public int? IdBitacora { get; set; }

    /// <summary>El administrador marca que el empleado ya pagó su consumo.</summary>
    [Column("Pagado_Por_Empleado")]
    public bool PagadoPorEmpleado { get; set; }

    [Column("Id_Estado_Venta")]
    public int IdEstadoVenta { get; set; }

    [Column("Id_Tipo_DTE")]
    public int? IdTipoDte { get; set; }

    [Column("Id_Cliente_Empresa")]
    public int? IdClienteEmpresa { get; set; }

    /// <summary>Cliente del CRM asignado a la venta (independiente del receptor de factura).</summary>
    [Column("Id_Cliente")]
    public int? IdCliente { get; set; }

    [Column("Id_Estado_Boleta")]
    public int? IdEstadoBoleta { get; set; }

    [Column("Fecha_Venta", TypeName = "datetime")]
    public DateTime FechaVenta { get; set; }

    [Column("Monto_Total")]
    public int MontoTotal { get; set; }

    /// <summary>Porcentaje de descuento aplicado al cobro (0 si no hubo descuento).</summary>
    [Column("Porcentaje_Descuento", TypeName = "decimal(5, 2)")]
    public decimal PorcentajeDescuento { get; set; }

    /// <summary>Monto descontado del total bruto por el descuento aplicado (0 si no hubo).</summary>
    [Column("Monto_Descuento")]
    public int MontoDescuento { get; set; }

    [Column("Motivo_Anulacion"), StringLength(300)]
    public string? MotivoAnulacion { get; set; }

    [Column("Fecha_Anulacion", TypeName = "datetime")]
    public DateTime? FechaAnulacion { get; set; }

    [Column("Correlativo_Diario")]
    public int? CorrelativoDiario { get; set; }

    [Column("Folio_DTE")]
    public int? FolioDte { get; set; }

    [Column("Monto_Neto")]
    public int? MontoNeto { get; set; }

    [Column("Monto_IVA")]
    public int? MontoIva { get; set; }

    /// <summary>Momento en que la comanda (preparación) se dio por terminada.
    /// NULL = comanda pendiente de preparar.</summary>
    [Column("Fecha_Comanda_Terminada", TypeName = "datetime")]
    public DateTime? FechaComandaTerminada { get; set; }

    [ForeignKey("IdClienteEmpresa")]
    [InverseProperty("VenVentas")]
    public virtual SiiClientesEmpresa? IdClienteEmpresaNavigation { get; set; }

    [ForeignKey("IdCliente")]
    [InverseProperty("VenVentas")]
    public virtual VenClientes? IdClienteNavigation { get; set; }

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
    public virtual TurTurno? IdTurnoNavigation { get; set; }

    [ForeignKey("IdTurnoCaja")]
    [InverseProperty("VenVentasCaja")]
    public virtual TurTurno? IdTurnoCajaNavigation { get; set; }

    [ForeignKey("IdUsuario")]
    [InverseProperty("VenVentas")]
    public virtual EmpUsuarios IdUsuarioNavigation { get; set; } = null!;

    [ForeignKey("IdBitacora")]
    [InverseProperty("VenVentas")]
    public virtual TurBitacora? IdBitacoraNavigation { get; set; }

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenDetalleVenta> VenDetalleVenta { get; set; } = new List<VenDetalleVenta>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenMetodosPagoVenta> VenMetodosPagoVenta { get; set; } = new List<VenMetodosPagoVenta>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenOrdenesPoint> VenOrdenesPoint { get; set; } = new List<VenOrdenesPoint>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<VenVentaPromociones> VenVentaPromociones { get; set; } = new List<VenVentaPromociones>();

    [InverseProperty("IdVentaNavigation")]
    public virtual ICollection<SiiDteEmision> SiiDteEmision { get; set; } = new List<SiiDteEmision>();
}
