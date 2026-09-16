namespace SgalApp.Api.DTOs;

public class ProviderSaveDto
{
    public int IdUsuario { get; set; }
    public string NombreProveedor { get; set; } = string.Empty;
    public string? Rut { get; set; }
    public string? Direccion { get; set; }
    public string? Comuna { get; set; }
    public string? Ciudad { get; set; }
    public string? Telefono { get; set; }
    public string? Correo { get; set; }
    public string? NombreContacto { get; set; }
}

public class ProviderStatusDto
{
    public int IdUsuario { get; set; }
}
