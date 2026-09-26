namespace SgalApp.Api.DTOs;

public class ClienteSaveDto
{
    /// <summary>"RUN" (persona), "RUT" (empresa) o null (sin documento).</summary>
    public string? TipoDocumento { get; set; }
    public string? Documento { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Telefono { get; set; }
    public string? Correo { get; set; }
    public string? Direccion { get; set; }

    /// <summary>Consentimiento explícito de marketing (Ley 21.719), separado del dato de venta.</summary>
    public bool AceptaMarketing { get; set; }
}
