namespace SgalApp.Api.Services.Dte;

/// <summary>Resultado genérico de una operación de conectividad contra LibreDTE.</summary>
public sealed class LibreDteResult
{
    public bool Ok { get; init; }
    public string? Error { get; init; }

    public static LibreDteResult Exito() => new() { Ok = true };
    public static LibreDteResult Fallo(string error) => new() { Ok = false, Error = error };
}

/// <summary>Datos de un CAF recién cargado (extraídos del XML del propio CAF).</summary>
public sealed class CafInfo
{
    public int TipoDte { get; init; }
    public int FolioDesde { get; init; }
    public int FolioHasta { get; init; }
}

/// <summary>
/// Certificado digital resuelto por LibreDTE (PEM). Corresponde a los campos <c>cert</c> y
/// <c>pkey</c> que devuelven createFakeCertificate y system/certificate/loader/load.
/// </summary>
public sealed class DteCertificado
{
    public string Certificate { get; init; } = string.Empty;
    public string PrivateKey { get; init; } = string.Empty;
}

/// <summary>Resultado de construir (firmar y timbrar) un documento con builder/build.</summary>
public sealed class DteBuildResult
{
    /// <summary>DTE firmado en base64 (campo <c>document_xml</c> de la respuesta).</summary>
    public string DocumentXml { get; init; } = string.Empty;
}

/// <summary>Error de negocio devuelto por LibreDTE (para diferenciarlo de fallas de red).</summary>
public sealed class DteException : Exception
{
    public DteException(string message) : base(message) { }
}
