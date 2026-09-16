namespace SgalApp.Api.DTOs.Point
{
    /// <summary>
    /// Solicitud que envía el punto de venta para cargar un monto en la terminal Point.
    /// </summary>
    public class PointOrderCreateDto
    {
        /// <summary>Monto a cobrar, entero en pesos chilenos.</summary>
        public int Monto { get; set; }

        /// <summary>
        /// Referencia única de la orden, usada para reconciliar con la venta.
        /// Si no se envía, el servicio genera una. Máx. 64 caracteres: letras, números, guion y guion bajo.
        /// </summary>
        public string? ReferenciaExterna { get; set; }

        /// <summary>Descripción visible en la terminal y en el detalle de la orden.</summary>
        public string? Descripcion { get; set; }

        /// <summary>Terminal destino. Si no se envía, se usa la configurada por defecto.</summary>
        public string? TerminalId { get; set; }
    }

    /// <summary>Respuesta simplificada que consume el frontend.</summary>
    public class PointOrderResultDto
    {
        public string IdOrden { get; set; } = string.Empty;
        public string? Estado { get; set; }
        public string? DetalleEstado { get; set; }
        public string? ReferenciaExterna { get; set; }
        public int? MontoPagado { get; set; }
        public string? TipoMedioPago { get; set; }
        public string? MarcaTarjeta { get; set; }
        public int? Cuotas { get; set; }
        public string? IdPago { get; set; }
    }
}
