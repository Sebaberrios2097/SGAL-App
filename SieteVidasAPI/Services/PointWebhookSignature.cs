using System.Security.Cryptography;
using System.Text;

namespace SieteVidasAPI.Services
{
    /// <summary>
    /// Valida la autenticidad de las notificaciones Webhook de Mercado Pago
    /// a partir del header x-signature y la clave secreta de la aplicación.
    /// </summary>
    public static class PointWebhookSignature
    {
        public static bool IsValid(string? xSignature, string? xRequestId, string? dataId, string secret)
        {
            if (string.IsNullOrWhiteSpace(xSignature) || string.IsNullOrWhiteSpace(secret))
            {
                return false;
            }

            var (timestamp, hash) = Parse(xSignature);
            if (string.IsNullOrWhiteSpace(timestamp) || string.IsNullOrWhiteSpace(hash))
            {
                return false;
            }

            // El manifest omite los campos que no vengan en la notificación.
            var manifest = new StringBuilder();
            if (!string.IsNullOrWhiteSpace(dataId))
            {
                manifest.Append($"id:{dataId.ToLowerInvariant()};");
            }
            if (!string.IsNullOrWhiteSpace(xRequestId))
            {
                manifest.Append($"request-id:{xRequestId};");
            }
            manifest.Append($"ts:{timestamp};");

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var computed = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(manifest.ToString())));

            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(computed.ToLowerInvariant()),
                Encoding.UTF8.GetBytes(hash.ToLowerInvariant()));
        }

        /// <summary>Extrae ts y v1 del header, con el formato "ts=1704908010,v1=618c85345...".</summary>
        private static (string? Timestamp, string? Hash) Parse(string xSignature)
        {
            string? timestamp = null;
            string? hash = null;

            foreach (var part in xSignature.Split(','))
            {
                var separator = part.IndexOf('=');
                if (separator <= 0)
                {
                    continue;
                }

                var key = part[..separator].Trim();
                var value = part[(separator + 1)..].Trim();

                if (key.Equals("ts", StringComparison.OrdinalIgnoreCase))
                {
                    timestamp = value;
                }
                else if (key.Equals("v1", StringComparison.OrdinalIgnoreCase))
                {
                    hash = value;
                }
            }

            return (timestamp, hash);
        }
    }
}
