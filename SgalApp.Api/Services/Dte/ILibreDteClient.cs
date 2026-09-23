namespace SgalApp.Api.Services.Dte;

/// <summary>
/// Cliente del microservicio LibreDTE Core API (edición comunidad, imagen oficial
/// ghcr.io/libredte/libredte-lib-core-api). La API es sin estado y por componentes: SGAL-App
/// aporta certificado, CAF y datos, y LibreDTE firma, timbra y renderiza. Todas las operaciones
/// son POST bajo /api con el cuerpo envuelto en {"parameters":{…}} y la respuesta en {"data":{…}}.
/// </summary>
public interface ILibreDteClient
{
    /// <summary>Comprueba que el microservicio LibreDTE responde.</summary>
    Task<LibreDteResult> PingAsync(CancellationToken cancellationToken = default);

    /// <summary>DESARROLLO: genera un certificado ficticio para el mandatario (sin comprar nada).</summary>
    Task<DteCertificado> CrearCertificadoFalsoAsync(string run, string nombre, string email, CancellationToken cancellationToken = default);

    /// <summary>Carga un certificado real (.p12/.pfx) y su clave, y devuelve el certificado resuelto.</summary>
    Task<DteCertificado> CargarCertificadoAsync(byte[] pfx, string clave, CancellationToken cancellationToken = default);

    /// <summary>DESARROLLO: genera un CAF ficticio y devuelve su XML en base64 (listo para build).</summary>
    Task<string> CrearCafFalsoAsync(string rutEmisor, string razonSocial, int tipoDte, int folioDesde, int folioHasta, CancellationToken cancellationToken = default);

    /// <summary>
    /// Construye (firma y timbra) el documento. <paramref name="parsedData"/> es el objeto con
    /// Encabezado + Detalle; <paramref name="cafBase64"/> es el XML del CAF en base64.
    /// </summary>
    Task<DteBuildResult> ConstruirAsync(object parsedData, string cafBase64, DteCertificado certificado, CancellationToken cancellationToken = default);

    /// <summary>Renderiza el documento firmado (base64) a PDF y devuelve los bytes del PDF.</summary>
    Task<byte[]> RenderizarPdfAsync(string documentXmlBase64, CancellationToken cancellationToken = default);
}
