using System.Text.Json;
using System.Text.Json.Serialization;

namespace SieteVidasAPI.DTOs.Point
{
    // ─── Modelos de la Orders API de Mercado Pago (snake_case en el JSON) ────────────

    public class PointOrderApiRequest
    {
        public string Type { get; set; } = "point";
        public string ExternalReference { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? ExpirationTime { get; set; }
        public PointTransactionsRequest Transactions { get; set; } = new();
        public PointOrderConfig Config { get; set; } = new();
        public List<PointTax>? Taxes { get; set; }
    }

    public class PointTransactionsRequest
    {
        public List<PointPaymentRequest> Payments { get; set; } = new();
    }

    public class PointPaymentRequest
    {
        /// <summary>En Chile (MLC) el monto va como entero sin decimales, serializado como string.</summary>
        public string Amount { get; set; } = "0";
    }

    public class PointOrderConfig
    {
        public PointTerminalConfig Point { get; set; } = new();
        public PointPaymentMethodConfig? PaymentMethod { get; set; }
    }

    public class PointTerminalConfig
    {
        public string TerminalId { get; set; } = string.Empty;
        public string? PrintOnTerminal { get; set; }
    }

    public class PointPaymentMethodConfig
    {
        /// <summary>Medio de pago preseleccionado en la terminal: debit_card, credit_card, etc.</summary>
        public string? DefaultType { get; set; }
    }

    public class PointTax
    {
        public string PayerCondition { get; set; } = string.Empty;
    }

    public class PointOrder
    {
        public string Id { get; set; } = string.Empty;
        public string? Type { get; set; }
        public string? Status { get; set; }
        public string? StatusDetail { get; set; }
        public string? ExternalReference { get; set; }
        public string? Description { get; set; }
        public string? CountryCode { get; set; }
        public string? TotalPaidAmount { get; set; }
        public DateTimeOffset? CreatedDate { get; set; }
        public DateTimeOffset? LastUpdatedDate { get; set; }
        public PointOrderConfigResponse? Config { get; set; }
        public PointTransactions? Transactions { get; set; }
    }

    public class PointOrderConfigResponse
    {
        public PointTerminalConfig? Point { get; set; }
        public PointPaymentMethodConfig? PaymentMethod { get; set; }
    }

    public class PointTransactions
    {
        public List<PointPayment>? Payments { get; set; }
        public List<PointRefund>? Refunds { get; set; }
    }

    public class PointPayment
    {
        public string? Id { get; set; }
        public string? Amount { get; set; }
        public string? PaidAmount { get; set; }
        public string? Status { get; set; }
        public string? StatusDetail { get; set; }
        public PointPaymentMethod? PaymentMethod { get; set; }
        public PointPaymentReference? Reference { get; set; }
    }

    public class PointPaymentMethod
    {
        public string? Id { get; set; }
        public string? Type { get; set; }
        public int? Installments { get; set; }
    }

    public class PointPaymentReference
    {
        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? Id { get; set; }
    }

    public class PointRefund
    {
        public string? Id { get; set; }
        public string? TransactionId { get; set; }
        public string? ReferenceId { get; set; }
        public string? Amount { get; set; }
        public string? Status { get; set; }
    }

    // ─── Terminals ───────────────────────────────────────────────────────────────────

    public class PointTerminalsResponse
    {
        public PointTerminalsData? Data { get; set; }
    }

    public class PointTerminalsData
    {
        public List<PointTerminal> Terminals { get; set; } = new();
    }

    public class PointTerminal
    {
        public string Id { get; set; } = string.Empty;

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? PosId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? StoreId { get; set; }

        public string? ExternalPosId { get; set; }

        /// <summary>PDV (integrada), STANDALONE (modo por defecto) o UNDEFINED.</summary>
        public string? OperatingMode { get; set; }
    }

    public class PointTerminalsSetupRequest
    {
        public List<PointTerminalSetup> Terminals { get; set; } = new();
    }

    public class PointTerminalSetup
    {
        public string Id { get; set; } = string.Empty;
        public string OperatingMode { get; set; } = "PDV";
    }

    // ─── Simulación de estados (solo ambiente de prueba) ─────────────────────────────

    public class PointSimulationRequest
    {
        public string Status { get; set; } = "processed";
        public string? PaymentMethodType { get; set; }
        public string? PaymentMethodId { get; set; }
        public int? Installments { get; set; }
        public string? StatusDetail { get; set; }
    }

    // ─── Webhook ─────────────────────────────────────────────────────────────────────

    public class PointWebhookNotification
    {
        public string? Action { get; set; }
        public string? Type { get; set; }
        public bool LiveMode { get; set; }
        public DateTimeOffset? DateCreated { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? UserId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ApplicationId { get; set; }

        public PointOrder? Data { get; set; }
    }

    /// <summary>
    /// Mercado Pago devuelve algunos identificadores como número y otros como string
    /// según el endpoint. Este converter acepta ambas formas y siempre entrega string.
    /// </summary>
    public class FlexibleStringConverter : JsonConverter<string?>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            return reader.TokenType switch
            {
                JsonTokenType.String => reader.GetString(),
                JsonTokenType.Number => reader.TryGetInt64(out long l)
                    ? l.ToString(System.Globalization.CultureInfo.InvariantCulture)
                    : reader.GetDouble().ToString(System.Globalization.CultureInfo.InvariantCulture),
                JsonTokenType.Null => null,
                _ => throw new JsonException($"No se pudo convertir el token {reader.TokenType} a string.")
            };
        }

        public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
        {
            if (value == null)
            {
                writer.WriteNullValue();
            }
            else
            {
                writer.WriteStringValue(value);
            }
        }
    }
}
