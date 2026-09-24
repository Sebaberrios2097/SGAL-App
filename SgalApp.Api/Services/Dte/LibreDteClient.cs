using System.Text;
using System.Text.Json;

namespace SgalApp.Api.Services.Dte;

/// <summary>
/// Implementación del cliente LibreDTE Core API sobre un <see cref="HttpClient"/> tipado. La URL
/// base (origen) se configura en Program.cs desde <c>LibreDteOptions</c>; las rutas cuelgan de
/// <c>/api</c>. El cuerpo se envía como {"parameters": …} y la respuesta útil viene en "data".
/// Contrato verificado en vivo contra la imagen oficial (ver memoria del proyecto).
/// </summary>
public sealed class LibreDteClient : ILibreDteClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LibreDteClient> _logger;

    private static class Endpoints
    {
        public const string Ping = "/";
        public const string CrearCertificadoFalso = "/api/billing/trading_parties/mandatario_manager/createFakeCertificate";
        public const string CargarCertificado = "/api/system/certificate/loader/load";
        public const string CrearCafFalso = "/api/billing/identifier/caf_faker/create";
        public const string Build = "/api/billing/document/builder/build";
        public const string Render = "/api/billing/document/renderer/render";
        public const string CrearSobre = "/api/billing/document/dispatcher/create";
        public const string EnviarSii = "/api/billing/integration/sii_dte/sendXmlDocument";
        public const string EstadoSii = "/api/billing/integration/sii_dte/checkXmlDocumentSentStatus";
    }

    public LibreDteClient(HttpClient http, ILogger<LibreDteClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<LibreDteResult> PingAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await _http.GetAsync(Endpoints.Ping, cancellationToken);
            if (response.IsSuccessStatusCode)
                return LibreDteResult.Exito();

            _logger.LogWarning("LibreDTE respondió {Status} al comprobar conectividad.",
                (int)response.StatusCode);
            return LibreDteResult.Fallo(
                $"LibreDTE respondió con estado HTTP {(int)response.StatusCode}.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo contactar LibreDTE.");
            return LibreDteResult.Fallo("No se pudo contactar el servicio LibreDTE.");
        }
    }

    public async Task<DteCertificado> CrearCertificadoFalsoAsync(string run, string nombre, string email, CancellationToken cancellationToken = default)
    {
        using var data = await PostAsync(Endpoints.CrearCertificadoFalso, new
        {
            mandatario = new { run, nombre, email }
        }, cancellationToken);
        return LeerCertificado(data.RootElement);
    }

    public async Task<DteCertificado> CargarCertificadoAsync(byte[] pfx, string clave, CancellationToken cancellationToken = default)
    {
        using var data = await PostAsync(Endpoints.CargarCertificado, new
        {
            certificate = new { data = Convert.ToBase64String(pfx), password = clave }
        }, cancellationToken);
        return LeerCertificado(data.RootElement);
    }

    public async Task<string> CrearCafFalsoAsync(string rutEmisor, string razonSocial, int tipoDte, int folioDesde, int folioHasta, CancellationToken cancellationToken = default)
    {
        using var data = await PostAsync(Endpoints.CrearCafFalso, new
        {
            emisor = new { rut = rutEmisor, razon_social = razonSocial },
            codigoDocumento = tipoDte,
            folioDesde,
            folioHasta
        }, cancellationToken);

        if (!data.RootElement.TryGetProperty("xml", out var xml) || xml.ValueKind != JsonValueKind.String)
            throw new DteException("LibreDTE no devolvió el XML del CAF.");
        return xml.GetString()!;
    }

    public async Task<DteBuildResult> ConstruirAsync(object parsedData, string cafBase64, DteCertificado certificado, CancellationToken cancellationToken = default)
    {
        using var data = await PostAsync(Endpoints.Build, new
        {
            bag = new
            {
                parsedData,
                caf = cafBase64,
                certificate = new { certificate = certificado.Certificate, privateKey = certificado.PrivateKey }
            }
        }, cancellationToken);

        if (!data.RootElement.TryGetProperty("document_xml", out var xml) || xml.ValueKind != JsonValueKind.String)
            throw new DteException("LibreDTE no devolvió el documento firmado (document_xml).");
        return new DteBuildResult { DocumentXml = xml.GetString()! };
    }

    public async Task<byte[]> RenderizarPdfAsync(string documentXmlBase64, CancellationToken cancellationToken = default)
    {
        using var data = await PostAsync(Endpoints.Render, new
        {
            bag = new
            {
                xmlDocument = documentXmlBase64,
                options = new { renderer = new { format = "pdf", renderings = new { tributaria = 1 } } }
            }
        }, cancellationToken);

        if (!data.RootElement.TryGetProperty("renderings", out var renderings)
            || renderings.ValueKind != JsonValueKind.Array || renderings.GetArrayLength() == 0)
            throw new DteException("LibreDTE no devolvió el PDF renderizado.");

        var content = renderings[0].TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String
            ? c.GetString()
            : null;
        if (string.IsNullOrEmpty(content))
            throw new DteException("El renderizado de LibreDTE no incluyó contenido PDF.");
        return Convert.FromBase64String(content);
    }

    public async Task<long?> EnviarAlSiiAsync(string documentXmlBase64, DteCertificado certificado,
        string rut, string razonSocial, int? resolucionNumero, DateOnly? resolucionFecha,
        int ambiente, CancellationToken cancellationToken = default)
    {
        var certObj = new { certificate = certificado.Certificate, privateKey = certificado.PrivateKey };

        // 1. Armar el sobre (EnvioDTE / EnvioBOLETA). Validado localmente.
        using var sobre = await PostAsync(Endpoints.CrearSobre, new
        {
            bag = new
            {
                xmlDocument = documentXmlBase64,
                certificate = certObj,
                emisor = new
                {
                    rut,
                    razon_social = razonSocial,
                    autorizacion_dte = new
                    {
                        fecha_resolucion = resolucionFecha?.ToString("yyyy-MM-dd") ?? "2014-08-22",
                        numero_resolucion = resolucionNumero ?? 0
                    }
                }
            }
        }, cancellationToken);

        // 2. Enviar el sobre al SII. NOTA: requiere certificado real; el contrato exacto de esta
        // llamada debe verificarse contra maullin cuando exista el certificado.
        using var envio = await PostAsync(Endpoints.EnviarSii, new
        {
            request = new { certificate = certObj, options = new { environment = ambiente } },
            doc = sobre.RootElement.GetProperty("xml").GetString(),
            company = rut,
            compress = false
        }, cancellationToken);

        return BuscarTrackId(envio.RootElement);
    }

    public async Task<DteEstadoSiiResult> ConsultarEstadoSiiAsync(long trackId, DteCertificado certificado,
        string rut, int ambiente, CancellationToken cancellationToken = default)
    {
        var certObj = new { certificate = certificado.Certificate, privateKey = certificado.PrivateKey };
        using var respuesta = await PostAsync(Endpoints.EstadoSii, new
        {
            request = new { certificate = certObj, options = new { environment = ambiente } },
            trackId,
            company = rut
        }, cancellationToken);

        var json = respuesta.RootElement.GetRawText();
        var texto = json.ToUpperInvariant();
        var estado = texto.Contains("RECHAZ", StringComparison.Ordinal) ? "Rechazado"
            : texto.Contains("REPARO", StringComparison.Ordinal) ? "Aceptado con reparos"
            : texto.Contains("ACEPT", StringComparison.Ordinal) ? "Aceptado"
            : "Enviado";
        return new DteEstadoSiiResult { Estado = estado, RespuestaJson = json };
    }

    /// <summary>Busca recursivamente un track id (trackid/track_id/trackId) en la respuesta.</summary>
    private static long? BuscarTrackId(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in element.EnumerateObject())
            {
                var name = prop.Name.Replace("_", "").ToLowerInvariant();
                if (name is "trackid" && prop.Value.ValueKind is JsonValueKind.Number && prop.Value.TryGetInt64(out var t))
                    return t;
                if (name is "trackid" && prop.Value.ValueKind is JsonValueKind.String && long.TryParse(prop.Value.GetString(), out var ts))
                    return ts;
                var nested = BuscarTrackId(prop.Value);
                if (nested.HasValue) return nested;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var nested = BuscarTrackId(item);
                if (nested.HasValue) return nested;
            }
        }
        return null;
    }

    private static DteCertificado LeerCertificado(JsonElement data)
    {
        var cert = data.TryGetProperty("cert", out var c) ? c.GetString() : null;
        var pkey = data.TryGetProperty("pkey", out var p) ? p.GetString() : null;
        if (string.IsNullOrEmpty(cert) || string.IsNullOrEmpty(pkey))
            throw new DteException("LibreDTE no devolvió un certificado válido (cert/pkey).");
        return new DteCertificado { Certificate = cert, PrivateKey = pkey };
    }

    /// <summary>
    /// Envía {"parameters": …} al endpoint y devuelve el nodo "data" de la respuesta (o la raíz si
    /// no viene envuelto). El <see cref="JsonDocument"/> devuelto debe liberarse (using).
    /// </summary>
    private async Task<JsonDocument> PostAsync(string path, object parameters, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new { parameters });
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync(path, content, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falla de red al llamar a LibreDTE {Path}.", path);
            throw new DteException("No se pudo contactar el servicio LibreDTE.");
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("LibreDTE {Path} respondió {Status}: {Body}", path, (int)response.StatusCode, body);
            throw new DteException($"LibreDTE rechazó la operación: {ExtraerDetalle(body)}");
        }

        var doc = JsonDocument.Parse(body);
        if (doc.RootElement.ValueKind == JsonValueKind.Object
            && doc.RootElement.TryGetProperty("data", out var dataElement))
        {
            // Se clona el nodo "data" en un documento propio para poder liberar el original.
            var clone = JsonDocument.Parse(dataElement.GetRawText());
            doc.Dispose();
            return clone;
        }
        return doc;
    }

    private static string ExtraerDetalle(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String)
                return d.GetString()!;
            if (doc.RootElement.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String)
                return t.GetString()!;
        }
        catch { /* cuerpo no-JSON */ }
        return body.Length > 300 ? body[..300] : body;
    }
}
