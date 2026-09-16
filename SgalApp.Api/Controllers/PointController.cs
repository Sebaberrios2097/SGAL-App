using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Api.DTOs.Point;
using SgalApp.Api.Services;
using System.Globalization;
using System.Text.Json;
using SgalApp.Api.Security;
using SgalApp.Infrastructure.Context;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PointController : ControllerBase
    {
        private readonly IPointService _pointService;
        private readonly IPointSaleService _pointSales;
        private readonly MercadoPagoPointOptions _options;
        private readonly ILogger<PointController> _logger;
        private readonly SgalContext _context;

        public PointController(
            IPointService pointService,
            IPointSaleService pointSales,
            IOptions<MercadoPagoPointOptions> options,
            ILogger<PointController> logger,
            SgalContext context)
        {
            _pointService = pointService;
            _pointSales = pointSales;
            _options = options.Value;
            _logger = logger;
            _context = context;
        }

        /// <summary>Lista las terminals de la cuenta para identificar el id y el modo de operación.</summary>
        [HttpGet("terminals")]
        [Permission(Permissions.PointAdmin)]
        public async Task<IActionResult> GetTerminals([FromQuery] string? storeId, [FromQuery] string? posId, CancellationToken cancellationToken)
        {
            try
            {
                var terminals = await _pointService.GetTerminalsAsync(storeId, posId, cancellationToken);
                return Ok(terminals);
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>
        /// Cambia el modo de operación de una terminal. Debe quedar en PDV para operar integrada;
        /// en ese modo la terminal deja de permitir cobros manuales desde su pantalla.
        /// </summary>
        [HttpPatch("terminals/{terminalId}/operating-mode")]
        [Permission(Permissions.PointAdmin)]
        public async Task<IActionResult> SetOperatingMode(string terminalId, [FromQuery] string mode = "PDV", CancellationToken cancellationToken = default)
        {
            if (!mode.Equals("PDV", StringComparison.OrdinalIgnoreCase) &&
                !mode.Equals("STANDALONE", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { mensaje = "El modo de operación debe ser PDV o STANDALONE." });
            }

            try
            {
                var terminals = await _pointService.SetOperatingModeAsync(terminalId, mode.ToUpperInvariant(), cancellationToken);
                return Ok(terminals);
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>Carga el monto en la terminal para que el cliente pague con tarjeta.</summary>
        [HttpPost("orders")]
        [Permission(Permissions.PointAdmin)]
        public async Task<IActionResult> CreateOrder([FromBody] PointOrderCreateDto dto, CancellationToken cancellationToken)
        {
            if (dto == null || dto.Monto <= 0)
            {
                return BadRequest(new { mensaje = "El monto a cobrar debe ser mayor a cero." });
            }

            try
            {
                var order = await _pointService.CreateOrderAsync(dto, cancellationToken);
                return Ok(ToResult(order));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensaje = ex.Message });
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>
        /// Consulta el estado de la orden. El frontend puede usarlo mientras espera
        /// que el cliente complete el pago en la terminal.
        /// </summary>
        [HttpGet("orders/{orderId}")]
        [Permission(Permissions.SalesCreatePoint)]
        public async Task<IActionResult> GetOrder(string orderId, CancellationToken cancellationToken)
        {
            if (!await OwnsOrder(orderId, cancellationToken)) return Forbid();
            try
            {
                var order = await _pointService.GetOrderAsync(orderId, cancellationToken);
                return Ok(ToResult(order));
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>Cancela una orden que todavía no fue pagada.</summary>
        [HttpPost("orders/{orderId}/cancel")]
        [Permission(Permissions.SalesCreatePoint)]
        public async Task<IActionResult> CancelOrder(string orderId, CancellationToken cancellationToken)
        {
            if (!await OwnsOrder(orderId, cancellationToken)) return Forbid();
            try
            {
                var order = await _pointService.CancelOrderAsync(orderId, cancellationToken);
                return Ok(ToResult(order));
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>Reembolsa el total de una orden ya procesada.</summary>
        [HttpPost("orders/{orderId}/refund")]
        [Permission(Permissions.PointAdmin)]
        public async Task<IActionResult> RefundOrder(string orderId, CancellationToken cancellationToken)
        {
            try
            {
                var order = await _pointService.RefundOrderAsync(orderId, cancellationToken);
                return Ok(ToResult(order));
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>
        /// Simula el desenlace de una orden sin usar la terminal física.
        /// Solo disponible con credenciales de prueba (AllowSimulation).
        /// </summary>
        [HttpPost("orders/{orderId}/simulate")]
        [Permission(Permissions.PointAdmin)]
        public async Task<IActionResult> SimulateOrder(string orderId, [FromBody] PointSimulationRequest simulation, CancellationToken cancellationToken)
        {
            if (!_options.AllowSimulation)
            {
                return BadRequest(new { mensaje = "La simulación de órdenes está deshabilitada en esta configuración." });
            }

            try
            {
                await _pointService.SimulateOrderAsync(orderId, simulation, cancellationToken);
                return Ok(new { mensaje = "Simulación enviada. El estado puede demorar unos segundos en actualizarse." });
            }
            catch (PointApiException ex)
            {
                return MapPointError(ex);
            }
        }

        /// <summary>
        /// Recibe las notificaciones de Mercado Pago sobre el desenlace de la orden
        /// (order.processed, order.canceled, order.failed, order.expired, order.refunded, order.action_required).
        /// </summary>
        [HttpPost("webhook")]
        public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
        {
            using var reader = new StreamReader(Request.Body);
            var rawBody = await reader.ReadToEndAsync(cancellationToken);

            // Mercado Pago envía data.id en el query string; se usa para armar el manifest de la firma.
            var dataId = Request.Query["data.id"].FirstOrDefault();

            PointWebhookNotification? notification;
            try
            {
                notification = JsonSerializer.Deserialize<PointWebhookNotification>(rawBody, PointService.JsonOptions);
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Webhook de Point con body inválido: {Body}", rawBody);
                return BadRequest();
            }

            dataId ??= notification?.Data?.Id;

            var signatureValid = PointWebhookSignature.IsValid(
                Request.Headers["x-signature"].FirstOrDefault(),
                Request.Headers["x-request-id"].FirstOrDefault(),
                dataId,
                _options.WebhookSecret);

            if (!signatureValid)
            {
                _logger.LogWarning("Webhook de Point descartado: firma inválida. DataId={DataId}", dataId);
                return Unauthorized();
            }

            _logger.LogInformation(
                "Webhook Point recibido. Action={Action} Orden={OrderId} Estado={Status} Referencia={ExternalReference}",
                notification?.Action,
                notification?.Data?.Id,
                notification?.Data?.Status,
                notification?.Data?.ExternalReference);

            if (notification?.Data != null && !string.IsNullOrWhiteSpace(notification.Data.Id))
            {
                try
                {
                    await _pointSales.HandleOrderUpdateAsync(notification.Data, cancellationToken);
                }
                catch (Exception ex)
                {
                    // Se registra el error pero se responde 200: si devolvemos error, Mercado Pago
                    // reintenta la misma notificación y el problema es local, no de la entrega.
                    _logger.LogError(ex, "Error al aplicar el webhook de la orden {OrderId}.", notification.Data.Id);
                }
            }

            // Se responde 200 de inmediato: Mercado Pago reintenta si no recibe respuesta a tiempo.
            return Ok();
        }

        // ─── Helpers ────────────────────────────────────────────────────────────────

        private static PointOrderResultDto ToResult(PointOrder order)
        {
            var payment = order.Transactions?.Payments?.FirstOrDefault();

            return new PointOrderResultDto
            {
                IdOrden = order.Id,
                Estado = order.Status,
                DetalleEstado = order.StatusDetail,
                ReferenciaExterna = order.ExternalReference,
                MontoPagado = ParseAmount(payment?.PaidAmount ?? order.TotalPaidAmount),
                TipoMedioPago = payment?.PaymentMethod?.Type,
                MarcaTarjeta = payment?.PaymentMethod?.Id,
                Cuotas = payment?.PaymentMethod?.Installments,
                IdPago = payment?.Id
            };
        }

        private Task<bool> OwnsOrder(string orderId, CancellationToken cancellationToken) =>
            _context.VenOrdenesPoint.AnyAsync(x => x.IdOrdenMp == orderId && x.IdVenta != null
                && x.IdVentaNavigation!.IdTurnoNavigation.IdUsuario == User.GetUserId(), cancellationToken);

        private static int? ParseAmount(string? amount) =>
            decimal.TryParse(amount, NumberStyles.Any, CultureInfo.InvariantCulture, out var value)
                ? (int)Math.Round(value)
                : null;

        private ObjectResult MapPointError(PointApiException ex) =>
            StatusCode(502, new
            {
                mensaje = "No se pudo comunicar con Mercado Pago Point.",
                detalle = ex.Message,
                respuesta = ex.ResponseBody
            });
    }
}
