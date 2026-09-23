namespace SgalApp.Api.Configuration
{
    /// <summary>
    /// Configuración de la integración con el microservicio LibreDTE (Community, API REST)
    /// que firma los DTE, genera el timbre y los envía al SII. Se enlaza desde la sección
    /// "LibreDte" de appsettings / user-secrets.
    ///
    /// La URL base y el ambiente también pueden vivir en SII_Emisor (por instalación); estas
    /// opciones proveen los valores por defecto y el token de acceso, que nunca debe versionarse.
    /// </summary>
    public class LibreDteOptions
    {
        public const string SectionName = "LibreDte";

        /// <summary>URL base del microservicio LibreDTE (red interna de Docker).</summary>
        public string BaseUrl { get; set; } = "http://libredte:80";

        /// <summary>
        /// Token de acceso (hash del usuario LibreDTE). Se envía como autenticación HTTP Basic
        /// con el hash como usuario. Usar user-secrets / variables de entorno.
        /// </summary>
        public string ApiToken { get; set; } = string.Empty;

        /// <summary>Timeout de las llamadas HTTP a LibreDTE.</summary>
        public int TimeoutSeconds { get; set; } = 60;
    }
}
