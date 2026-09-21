using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Services
{
    /// <summary>Credenciales efectivas de Mercado Pago Point ya resueltas y descifradas.</summary>
    public sealed record MercadoPagoResolved(
        string AccessToken, string TerminalId, string BaseUrl, string WebhookSecret,
        string PrintOnTerminal, string PayerCondition, string ExpirationTime,
        bool AllowSimulation, bool AutoSimulate);

    public interface IPosCredentialProvider
    {
        /// <summary>Máquina Mercado Pago activa (BD, descifrada) o, si no hay, la configuración heredada.</summary>
        Task<MercadoPagoResolved> ResolveMercadoPagoAsync(CancellationToken cancellationToken = default);

        /// <summary>Cifra un valor sensible para guardarlo en la BD.</summary>
        string Protect(string plaintext);

        /// <summary>Descifra un valor guardado; null si viene vacío o no se puede descifrar.</summary>
        string? Unprotect(string? cipher);
    }

    public sealed class PosCredentialProvider : IPosCredentialProvider
    {
        // Proveedor por defecto mientras solo exista Mercado Pago.
        public const string MercadoPago = "mercadopago";

        private readonly SgalContext _context;
        private readonly IDataProtector _protector;
        private readonly MercadoPagoPointOptions _options;
        private readonly ILogger<PosCredentialProvider> _logger;

        public PosCredentialProvider(
            SgalContext context,
            IDataProtectionProvider dataProtection,
            IOptions<MercadoPagoPointOptions> options,
            ILogger<PosCredentialProvider> logger)
        {
            _context = context;
            _protector = dataProtection.CreateProtector("SGAL.PosCredentials.v1");
            _options = options.Value;
            _logger = logger;
        }

        public string Protect(string plaintext) => _protector.Protect(plaintext);

        public string? Unprotect(string? cipher)
        {
            if (string.IsNullOrEmpty(cipher)) return null;
            try { return _protector.Unprotect(cipher); }
            catch (Exception ex)
            {
                _logger.LogError(ex, "No se pudo descifrar una credencial POS.");
                return null;
            }
        }

        public async Task<MercadoPagoResolved> ResolveMercadoPagoAsync(CancellationToken cancellationToken = default)
        {
            var maquina = await _context.IntMaquinasPos.AsNoTracking()
                .Where(m => m.Activa && m.Proveedor == MercadoPago)
                .OrderByDescending(m => m.IdMaquina)
                .FirstOrDefaultAsync(cancellationToken);

            if (maquina == null) return Validate(FromOptions(), "la configuración de la aplicación");

            static string Pick(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value;

            // Cuando existe una máquina activa, la BD es la fuente de verdad para las
            // credenciales. No se debe caer silenciosamente a appsettings si una llave se
            // perdió o el valor cifrado está dañado: eso puede cobrar en otra cuenta.
            var accessToken = UnprotectRequired(maquina.AccessTokenCifrado, maquina.Nombre, "Access Token");
            var webhookSecret = string.IsNullOrWhiteSpace(maquina.WebhookSecretCifrado)
                ? string.Empty
                : UnprotectRequired(maquina.WebhookSecretCifrado, maquina.Nombre, "Webhook Secret");

            return Validate(new MercadoPagoResolved(
                AccessToken: accessToken,
                TerminalId: maquina.TerminalId?.Trim() ?? string.Empty,
                BaseUrl: Pick(maquina.BaseUrl, _options.BaseUrl),
                WebhookSecret: webhookSecret,
                PrintOnTerminal: Pick(maquina.PrintOnTerminal, _options.PrintOnTerminal),
                PayerCondition: Pick(maquina.PayerCondition, _options.PayerCondition),
                ExpirationTime: Pick(maquina.ExpirationTime, _options.ExpirationTime),
                AllowSimulation: maquina.PermiteSimulacion,
                AutoSimulate: maquina.AutoSimular), $"la máquina POS '{maquina.Nombre}'");
        }

        private string UnprotectRequired(string? cipher, string machineName, string fieldName)
        {
            if (string.IsNullOrWhiteSpace(cipher))
                throw new InvalidOperationException($"La máquina POS '{machineName}' no tiene {fieldName} configurado.");

            var plaintext = Unprotect(cipher);
            if (string.IsNullOrWhiteSpace(plaintext))
                throw new InvalidOperationException(
                    $"No se pudo descifrar {fieldName} de la máquina POS '{machineName}'. " +
                    "Verifique que las claves de Data Protection persistidas correspondan a esta instalación y vuelva a guardar la credencial.");
            return plaintext;
        }

        private static MercadoPagoResolved Validate(MercadoPagoResolved resolved, string source)
        {
            if (string.IsNullOrWhiteSpace(resolved.AccessToken))
                throw new InvalidOperationException($"Mercado Pago no tiene un Access Token válido en {source}.");
            if (string.IsNullOrWhiteSpace(resolved.TerminalId))
                throw new InvalidOperationException($"Mercado Pago no tiene un Terminal ID válido en {source}.");
            if (!Uri.TryCreate(resolved.BaseUrl, UriKind.Absolute, out var uri)
                || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
                throw new InvalidOperationException($"Mercado Pago no tiene una URL base válida en {source}.");
            return resolved;
        }

        private MercadoPagoResolved FromOptions() => new(
            _options.AccessToken, _options.TerminalId, _options.BaseUrl, _options.WebhookSecret,
            _options.PrintOnTerminal, _options.PayerCondition, _options.ExpirationTime,
            _options.AllowSimulation, _options.AutoSimulate);
    }
}
