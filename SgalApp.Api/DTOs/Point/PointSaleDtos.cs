namespace SgalApp.Api.DTOs.Point
{
    /// <summary>
    /// Venta que se cobra (total o parcialmente) con tarjeta en la terminal Point.
    /// La venta se registra como pendiente y se confirma cuando Mercado Pago informa el pago.
    /// </summary>
    public class PointSaleStartDto
    {
        public int? IdTurno { get; set; }

        /// <summary>
        /// Monto que se enviará a la terminal. El tipo definitivo (débito o crédito)
        /// se obtiene desde Mercado Pago después de procesar el cobro.
        /// </summary>
        public int MontoTarjeta { get; set; }

        /// <summary>Métodos distintos de tarjeta usados en un pago dividido.</summary>
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();

        public List<SaleItemDto> Items { get; set; } = new();

        public List<SalePromoInstanceDto> Promociones { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al total (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }

        /// <summary>Descripción opcional que se muestra en la terminal.</summary>
        public string? Descripcion { get; set; }
        public string TipoDocumento { get; set; } = "boleta";
        public FacturaReceptorDto? ReceptorFactura { get; set; }
    }

    public class PointSaleStartResultDto
    {
        public int IdVenta { get; set; }
        public string IdOrden { get; set; } = string.Empty;
        public string ReferenciaExterna { get; set; } = string.Empty;
        public string? Estado { get; set; }
        public int MontoTotal { get; set; }
        public int MontoTarjeta { get; set; }
    }

    /// <summary>Solicitud de anulación de una venta terminada.</summary>
    public class SaleVoidDto
    {
        /// <summary>Si los productos vuelven al inventario. Aplica solo a productos con stock controlado.</summary>
        public bool DevolverStock { get; set; } = true;
    }

    public class SaleVoidResultDto
    {
        public int IdVenta { get; set; }
        public int MontoReembolsadoTarjeta { get; set; }
        public int MontoEfectivoADevolver { get; set; }
        public bool StockDevuelto { get; set; }
        public string Mensaje { get; set; } = string.Empty;
    }

    /// <summary>Estado consolidado de una venta pendiente de pago con Point.</summary>
    public class PointSaleStatusDto
    {
        public int IdVenta { get; set; }
        public int IdEstadoVenta { get; set; }
        public string? EstadoVenta { get; set; }
        public string IdOrden { get; set; } = string.Empty;
        public string? EstadoOrden { get; set; }
        public string? DetalleEstadoOrden { get; set; }
        public int? MontoPagado { get; set; }
        public string? TipoMedioPago { get; set; }
        public string? MarcaTarjeta { get; set; }
        public int? Cuotas { get; set; }
    }
}
