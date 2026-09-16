using SgalApp.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs.Point;

namespace SgalApp.Api.Services
{
    /// <summary>
    /// Anulación de ventas ya terminadas. Cuando la venta incluye pago con tarjeta,
    /// la anulación implica el reembolso en Mercado Pago antes de tocar la venta:
    /// si el dinero no vuelve, la venta no se marca como anulada.
    /// </summary>
    public interface ISaleVoidService
    {
        Task<PointSaleResult<SaleVoidResultDto>> AnularAsync(int idVenta, bool devolverStock, CancellationToken cancellationToken = default);
    }

    public class SaleVoidService : ISaleVoidService
    {
        private readonly SgalContext _context;
        private readonly IPointService _pointService;
        private readonly ISaleLinesService _saleLines;
        private readonly ILogger<SaleVoidService> _logger;

        public SaleVoidService(
            SgalContext context,
            IPointService pointService,
            ISaleLinesService saleLines,
            ILogger<SaleVoidService> logger)
        {
            _context = context;
            _pointService = pointService;
            _saleLines = saleLines;
            _logger = logger;
        }

        public async Task<PointSaleResult<SaleVoidResultDto>> AnularAsync(int idVenta, bool devolverStock, CancellationToken cancellationToken = default)
        {
            var venta = await _context.VenVentas
                .Include(v => v.VenMetodosPagoVenta)
                .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);

            if (venta == null)
            {
                return PointSaleResult<SaleVoidResultDto>.Fallo($"La venta {idVenta} no existe.");
            }

            if (venta.IdEstadoVenta == EstadosVenta.Anulada)
            {
                return PointSaleResult<SaleVoidResultDto>.Fallo("La venta ya está anulada.");
            }

            if (venta.IdEstadoVenta == EstadosVenta.PendienteDePago)
            {
                return PointSaleResult<SaleVoidResultDto>.Fallo(
                    "La venta está pendiente de pago. Cancela el cobro en la terminal en lugar de anularla.");
            }

            if (venta.IdEstadoVenta != EstadosVenta.Terminada)
            {
                return PointSaleResult<SaleVoidResultDto>.Fallo("Solo se pueden anular ventas terminadas.");
            }

            int montoEfectivo = venta.VenMetodosPagoVenta
                .Where(m => m.IdMetodoPago is MetodosPago.Efectivo or MetodosPago.Transferencia)
                .Sum(m => m.Monto);

            // Órdenes de Point efectivamente pagadas: son las que hay que reversar.
            var ordenesPagadas = await _context.VenOrdenesPoint
                .Where(o => o.IdVenta == idVenta && o.Estado == "processed")
                .ToListAsync(cancellationToken);

            int montoReembolsado = 0;

            using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

            foreach (var orden in ordenesPagadas)
            {
                PointOrder resultado;
                try
                {
                    resultado = await _pointService.RefundOrderAsync(orden.IdOrdenMp, cancellationToken);
                }
                catch (PointApiException ex)
                {
                    // Sin reversa no hay anulación: la venta queda intacta.
                    await transaction.RollbackAsync(cancellationToken);
                    _logger.LogError(ex, "Falló el reembolso de la orden {OrderId} al anular la venta {IdVenta}.", orden.IdOrdenMp, idVenta);

                    return PointSaleResult<SaleVoidResultDto>.Fallo(
                        $"Mercado Pago rechazó la devolución del cobro con tarjeta, así que la venta no se anuló. Detalle: {ex.ResponseBody ?? ex.Message}");
                }

                orden.Estado = resultado.Status ?? "refunded";
                orden.DetalleEstado = resultado.StatusDetail;
                orden.FechaActualizacion = DateTime.Now;
                montoReembolsado += orden.Monto;
            }

            venta.IdEstadoVenta = EstadosVenta.Anulada;
            _context.Entry(venta).State = EntityState.Modified;

            if (devolverStock)
            {
                await _saleLines.RestoreStockAsync(idVenta, cancellationToken);
            }

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            _logger.LogInformation(
                "Venta {IdVenta} anulada. Reembolsado con tarjeta: {MontoTarjeta}. Efectivo a devolver en caja: {MontoEfectivo}. Stock devuelto: {DevolverStock}.",
                idVenta, montoReembolsado, montoEfectivo, devolverStock);

            return PointSaleResult<SaleVoidResultDto>.Ok(new SaleVoidResultDto
            {
                IdVenta = idVenta,
                MontoReembolsadoTarjeta = montoReembolsado,
                MontoEfectivoADevolver = montoEfectivo,
                StockDevuelto = devolverStock,
                Mensaje = montoEfectivo > 0
                    ? $"Venta anulada. La parte con tarjeta (${montoReembolsado:N0}) fue reembolsada; entrega ${montoEfectivo:N0} en efectivo desde la caja."
                    : $"Venta anulada. Se reembolsaron ${montoReembolsado:N0} a la tarjeta."
            });
        }
    }
}
