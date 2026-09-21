using SgalApp.Api.DTOs.Point;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SgalApp.Api.Services
{
    public class PointService : IPointService
    {
        internal static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        private readonly HttpClient _http;
        private readonly IPosCredentialProvider _credentials;
        private readonly ILogger<PointService> _logger;

        public PointService(HttpClient http, IPosCredentialProvider credentials, ILogger<PointService> logger)
        {
            _http = http;
            _credentials = credentials;
            _logger = logger;
        }

        public async Task<IReadOnlyList<PointTerminal>> GetTerminalsAsync(string? storeId = null, string? posId = null, CancellationToken cancellationToken = default)
        {
            var query = new List<string> { "limit=50", "offset=0" };
            if (!string.IsNullOrWhiteSpace(storeId)) query.Add($"store_id={Uri.EscapeDataString(storeId)}");
            if (!string.IsNullOrWhiteSpace(posId)) query.Add($"pos_id={Uri.EscapeDataString(posId)}");

            using var request = new HttpRequestMessage(HttpMethod.Get, $"/terminals/v1/list?{string.Join("&", query)}");
            var response = await SendAsync<PointTerminalsResponse>(request, cancellationToken);

            return response?.Data?.Terminals ?? new List<PointTerminal>();
        }

        public async Task<IReadOnlyList<PointTerminal>> SetOperatingModeAsync(string terminalId, string operatingMode, CancellationToken cancellationToken = default)
        {
            var body = new PointTerminalsSetupRequest
            {
                Terminals = new List<PointTerminalSetup>
                {
                    new() { Id = terminalId, OperatingMode = operatingMode }
                }
            };

            using var request = new HttpRequestMessage(HttpMethod.Patch, "/terminals/v1/setup")
            {
                Content = Serialize(body)
            };

            var response = await SendAsync<PointTerminalsResponse>(request, cancellationToken);

            return response?.Data?.Terminals ?? new List<PointTerminal>();
        }

        public async Task<PointOrder> CreateOrderAsync(PointOrderCreateDto dto, CancellationToken cancellationToken = default)
        {
            if (dto.Monto <= 0)
            {
                throw new ArgumentException("El monto de la orden debe ser mayor a cero.", nameof(dto));
            }

            var creds = await _credentials.ResolveMercadoPagoAsync(cancellationToken);
            var terminalId = string.IsNullOrWhiteSpace(dto.TerminalId) ? creds.TerminalId : dto.TerminalId;
            if (string.IsNullOrWhiteSpace(terminalId))
            {
                throw new InvalidOperationException("No hay una terminal Point configurada para procesar el cobro.");
            }

            var payload = new PointOrderApiRequest
            {
                Type = "point",
                ExternalReference = string.IsNullOrWhiteSpace(dto.ReferenciaExterna)
                    ? BuildExternalReference()
                    : dto.ReferenciaExterna,
                Description = dto.Descripcion,
                ExpirationTime = creds.ExpirationTime,
                Transactions = new PointTransactionsRequest
                {
                    // MLC exige el monto como entero, sin decimales.
                    Payments = new List<PointPaymentRequest>
                    {
                        new() { Amount = dto.Monto.ToString(CultureInfo.InvariantCulture) }
                    }
                },
                Config = new PointOrderConfig
                {
                    Point = new PointTerminalConfig
                    {
                        TerminalId = terminalId,
                        PrintOnTerminal = creds.PrintOnTerminal
                    }
                },
                Taxes = string.IsNullOrWhiteSpace(creds.PayerCondition)
                    ? null
                    : new List<PointTax> { new() { PayerCondition = creds.PayerCondition } }
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/orders")
            {
                Content = Serialize(payload)
            };
            // La llave de idempotencia evita que un reintento cargue dos veces el monto en la terminal.
            request.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());

            var order = await SendAsync<PointOrder>(request, cancellationToken);

            _logger.LogInformation(
                "Orden Point creada. Id={OrderId} Referencia={ExternalReference} Monto={Monto} Terminal={TerminalId}",
                order?.Id, payload.ExternalReference, dto.Monto, terminalId);

            return order ?? throw new PointApiException("Mercado Pago no devolvió la orden creada.", null, null);
        }

        public async Task<PointOrder> GetOrderAsync(string orderId, CancellationToken cancellationToken = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"/v1/orders/{Uri.EscapeDataString(orderId)}");
            var order = await SendAsync<PointOrder>(request, cancellationToken);

            return order ?? throw new PointApiException($"No se encontró la orden {orderId}.", null, null);
        }

        public async Task<PointOrder> CancelOrderAsync(string orderId, CancellationToken cancellationToken = default)
        {
            // Cancel y refund se envían sin body.
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/orders/{Uri.EscapeDataString(orderId)}/cancel");
            request.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());

            var order = await SendAsync<PointOrder>(request, cancellationToken);

            _logger.LogInformation("Orden Point cancelada. Id={OrderId} Estado={Status}", orderId, order?.Status);

            return order ?? throw new PointApiException($"No se pudo cancelar la orden {orderId}.", null, null);
        }

        public async Task<PointOrder> RefundOrderAsync(string orderId, CancellationToken cancellationToken = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/orders/{Uri.EscapeDataString(orderId)}/refund");
            request.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());

            var order = await SendAsync<PointOrder>(request, cancellationToken);

            _logger.LogInformation("Orden Point reembolsada. Id={OrderId} Estado={Status}", orderId, order?.Status);

            return order ?? throw new PointApiException($"No se pudo reembolsar la orden {orderId}.", null, null);
        }

        public async Task SimulateOrderAsync(string orderId, PointSimulationRequest simulation, CancellationToken cancellationToken = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/orders/{Uri.EscapeDataString(orderId)}/events")
            {
                Content = Serialize(simulation)
            };

            // Responde 204 sin body; el cambio de estado puede demorar algunos segundos.
            await SendAsync(request, cancellationToken);

            _logger.LogInformation("Simulación enviada para la orden {OrderId}. Estado={Status}", orderId, simulation.Status);
        }

        // ─── SgalApp.Infrastructure HTTP ────────────────────────────────────────────────────

        private static StringContent Serialize<T>(T value) =>
            new(JsonSerializer.Serialize(value, JsonOptions), Encoding.UTF8, "application/json");

        private static string BuildExternalReference() =>
            $"SV_{DateTime.Now:yyyyMMddHHmmss}_{Guid.NewGuid():N}"[..40];

        private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // Las credenciales se resuelven por solicitud: máquina POS activa (BD) o config.
            var creds = await _credentials.ResolveMercadoPagoAsync(cancellationToken);
            if (!string.IsNullOrWhiteSpace(creds.AccessToken))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", creds.AccessToken);
            if (request.RequestUri is { IsAbsoluteUri: false } && !string.IsNullOrWhiteSpace(creds.BaseUrl))
                request.RequestUri = new Uri(new Uri(creds.BaseUrl), request.RequestUri);

            var response = await _http.SendAsync(request, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError(
                    "Error de Mercado Pago Point. {Method} {Uri} devolvió {StatusCode}: {Body}",
                    request.Method, request.RequestUri, (int)response.StatusCode, body);

                throw new PointApiException(
                    $"Mercado Pago respondió {(int)response.StatusCode} al procesar la solicitud.",
                    response.StatusCode,
                    body);
            }

            return response;
        }

        private async Task<T?> SendAsync<T>(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = await SendAsync(request, cancellationToken);

            if (response.StatusCode == System.Net.HttpStatusCode.NoContent)
            {
                return default;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);

            return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, cancellationToken);
        }
    }

    /// <summary>Error devuelto por la API de Mercado Pago.</summary>
    public class PointApiException : Exception
    {
        public PointApiException(string message, System.Net.HttpStatusCode? statusCode, string? responseBody)
            : base(message)
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
        }

        public System.Net.HttpStatusCode? StatusCode { get; }

        public string? ResponseBody { get; }
    }
}
