namespace SieteVidasAPI.Configuration
{
    /// <summary>
    /// Configuración de la integración con Mercado Pago Point (Orders API).
    /// Se enlaza desde la sección "MercadoPagoPoint" de appsettings / user-secrets.
    /// </summary>
    public class MercadoPagoPointOptions
    {
        public const string SectionName = "MercadoPagoPoint";

        /// <summary>URL base de la API de Mercado Pago.</summary>
        public string BaseUrl { get; set; } = "https://api.mercadopago.com";

        /// <summary>
        /// Access Token de la aplicación. En desarrollo es el de prueba (prefijo APP_USR),
        /// en producción el de la cuenta recaudadora. Nunca debe versionarse: usar user-secrets.
        /// </summary>
        public string AccessToken { get; set; } = string.Empty;

        /// <summary>
        /// Terminal por defecto a la que se envían las órdenes, con el formato
        /// "tipo de terminal + __ + serial", por ejemplo "NEWLAND_N950__N950NCB801293324".
        /// Para pruebas sin hardware se usa el dispositivo virtual "NEWLAND_N950__SBX0000001".
        /// </summary>
        public string TerminalId { get; set; } = string.Empty;

        /// <summary>Clave secreta de los webhooks, usada para validar el header x-signature.</summary>
        public string WebhookSecret { get; set; } = string.Empty;

        /// <summary>
        /// Tiempo de validez de la orden en formato ISO-8601 de duración.
        /// Mínimo PT30S, máximo PT3H.
        /// </summary>
        public string ExpirationTime { get; set; } = "PT5M";

        /// <summary>Comportamiento de impresión del comprobante en la terminal.</summary>
        public string PrintOnTerminal { get; set; } = "no_ticket";

        /// <summary>
        /// Condición tributaria del pagador, requerida por Mercado Pago en Chile (MLC).
        /// </summary>
        public string PayerCondition { get; set; } = "payment_taxable_iva";

        /// <summary>
        /// Habilita el endpoint de simulación de estados. Solo debe estar activo
        /// mientras se trabaja con credenciales de prueba.
        /// </summary>
        public bool AllowSimulation { get; set; } = false;

        /// <summary>
        /// Simula automáticamente el resultado de cada orden creada. Debe habilitarse
        /// únicamente junto a credenciales de prueba y una terminal virtual.
        /// </summary>
        public bool AutoSimulate { get; set; } = false;
    }
}
