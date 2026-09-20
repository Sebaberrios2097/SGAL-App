using System.ComponentModel.DataAnnotations;

namespace SgalApp.Api.DTOs;

public sealed class UpdateOrganizationBrandingDto
{
    [Required, StringLength(120)]
    public string NombreComercial { get; set; } = string.Empty;

    [StringLength(180)]
    public string? RazonSocial { get; set; }

    [StringLength(300)]
    public string? Descripcion { get; set; }

    [StringLength(250)]
    public string? TextoPieDocumentos { get; set; }

    [StringLength(160)]
    public string? ContactoPublico { get; set; }

    [Required, StringLength(7, MinimumLength = 7)]
    public string ColorPrimario { get; set; } = "#1F4E5F";

    [Required, StringLength(7, MinimumLength = 7)]
    public string ColorSecundario { get; set; } = "#163A47";

    [Required, StringLength(7, MinimumLength = 7)]
    public string ColorAcento { get; set; } = "#D97706";

    [Required, StringLength(7, MinimumLength = 7)]
    public string ColorFondo { get; set; } = "#F8FAFC";
}

public sealed class UpdateOrganizationModulesDto
{
    public List<string> CodigosHabilitados { get; set; } = [];
}

public sealed class ModuleCatalogItemDto
{
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public bool EsNucleo { get; set; }
    public bool Habilitado { get; set; }
    public List<string> Dependencias { get; set; } = [];
    public int CantidadPermisos { get; set; }
    public List<ModuleFeatureDto> Funcionalidades { get; set; } = [];
}

public sealed class ModuleFeatureDto
{
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string Grupo { get; set; } = string.Empty;
    public bool EsCritico { get; set; }
}

public sealed class UpdateLogoLocationsDto
{
    public List<string> Ubicaciones { get; set; } = [];
    public bool ConfirmarReemplazo { get; set; }
}

public sealed class SetBackgroundEnabledDto
{
    public bool Habilitado { get; set; }
}
