using SgalApp.Api.DTOs.Point;

namespace SgalApp.Api.Services
{
    /// <summary>
    /// Acceso a la Orders API de Mercado Pago Point para el cobro presencial con terminal.
    /// </summary>
    public interface IPointService
    {
        /// <summary>Lista las terminals vinculadas a la cuenta, con su modo de operación.</summary>
        Task<IReadOnlyList<PointTerminal>> GetTerminalsAsync(string? storeId = null, string? posId = null, CancellationToken cancellationToken = default);

        /// <summary>Cambia el modo de operación de una terminal (PDV para operar integrada).</summary>
        Task<IReadOnlyList<PointTerminal>> SetOperatingModeAsync(string terminalId, string operatingMode, CancellationToken cancellationToken = default);

        /// <summary>Crea la orden y la envía a la terminal, donde el cliente completa el pago.</summary>
        Task<PointOrder> CreateOrderAsync(PointOrderCreateDto dto, CancellationToken cancellationToken = default);

        /// <summary>Consulta el estado actual de una orden.</summary>
        Task<PointOrder> GetOrderAsync(string orderId, CancellationToken cancellationToken = default);

        /// <summary>Cancela una orden que aún no fue pagada.</summary>
        Task<PointOrder> CancelOrderAsync(string orderId, CancellationToken cancellationToken = default);

        /// <summary>Reembolsa el total de una orden ya procesada (hasta 90 días después del pago).</summary>
        Task<PointOrder> RefundOrderAsync(string orderId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Simula el estado final de una orden. Solo funciona con credenciales de prueba
        /// y permite validar la integración sin usar la terminal física.
        /// </summary>
        Task SimulateOrderAsync(string orderId, PointSimulationRequest request, CancellationToken cancellationToken = default);
    }
}
