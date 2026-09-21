namespace SgalApp.Api.DTOs
{
    /// <summary>Máquina POS para la interfaz. Nunca expone los secretos, solo si están configurados.</summary>
    public sealed class PosMachineDto
    {
        public int IdMaquina { get; set; }
        public string Proveedor { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public bool Activa { get; set; }
        public string? TerminalId { get; set; }
        public string? BaseUrl { get; set; }
        public string? PrintOnTerminal { get; set; }
        public string? PayerCondition { get; set; }
        public string? ExpirationTime { get; set; }
        public bool PermiteSimulacion { get; set; }
        public bool AutoSimular { get; set; }
        public bool AccessTokenConfigurado { get; set; }
        public bool WebhookSecretConfigurado { get; set; }
    }

    /// <summary>
    /// Alta/edición de una máquina POS. Los secretos (AccessToken/WebhookSecret) solo se
    /// actualizan si vienen con valor; si llegan vacíos en una edición, se conserva el actual.
    /// </summary>
    public sealed class PosMachineUpsertDto
    {
        public string Proveedor { get; set; } = "mercadopago";
        public string Nombre { get; set; } = string.Empty;
        public bool Activa { get; set; } = true;
        public string? TerminalId { get; set; }
        public string? BaseUrl { get; set; }
        public string? PrintOnTerminal { get; set; }
        public string? PayerCondition { get; set; }
        public string? ExpirationTime { get; set; }
        public bool PermiteSimulacion { get; set; }
        public bool AutoSimular { get; set; }
        public string? AccessToken { get; set; }
        public string? WebhookSecret { get; set; }
    }
}
