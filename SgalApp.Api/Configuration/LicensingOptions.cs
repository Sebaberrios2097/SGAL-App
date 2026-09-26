namespace SgalApp.Api.Configuration;

/// <summary>
/// Configuración del cliente de licencia. Es OPT-IN: mientras <see cref="Enabled"/> sea false, la
/// app funciona igual que hoy (módulos desde la BD local, sin gate). Al activarlo, la app valida
/// contra la License API central y aplica acceso + módulos según el token firmado.
/// </summary>
public class LicensingOptions
{
    public const string SectionName = "Licensing";

    /// <summary>Activa la validación de licencia y el bloqueo por acceso.</summary>
    public bool Enabled { get; set; }

    /// <summary>URL base de la License API central (ej. https://licencias.tu-dominio.cl).</summary>
    public string ApiBaseUrl { get; set; } = string.Empty;

    /// <summary>Identidad de esta instalación (entregada por el panel al dar de alta).</summary>
    public string InstallationId { get; set; } = string.Empty;

    /// <summary>Código de activación de esta instalación (entregado por el panel).</summary>
    public string LicenseKey { get; set; } = string.Empty;

    /// <summary>Código único usado solo para el alta inicial automática.</summary>
    public string ActivationCode { get; set; } = string.Empty;

    /// <summary>Clave pública ES256 (PEM) para verificar la firma del token.</summary>
    public string PublicKeyPem { get; set; } = string.Empty;

    /// <summary>Cada cuántas horas revalidar contra la License API.</summary>
    public int RevalidateHours { get; set; } = 12;

    /// <summary>Intervalo dinámico de sincronización. Tiene prioridad sobre RevalidateHours.</summary>
    public int RevalidateMinutes { get; set; } = 5;

    /// <summary>Volumen persistente para identidad y token cacheado.</summary>
    public string StoragePath { get; set; } = string.Empty;

    public int TimeoutSeconds { get; set; } = 30;
}
