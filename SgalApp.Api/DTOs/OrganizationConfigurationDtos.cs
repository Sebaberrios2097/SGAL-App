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

    /// <summary>Mostrar el nombre del vendedor/cajero que atendió en el comprobante.</summary>
    public bool BoletaMuestraVendedor { get; set; } = true;

    /// <summary>Mostrar el detalle del método de pago y el vuelto en el comprobante.</summary>
    public bool BoletaMuestraPago { get; set; } = true;

    /// <summary>Cola propia del comprobante, independiente de <see cref="TextoPieDocumentos"/>.</summary>
    [StringLength(250)]
    public string? BoletaColaPersonalizada { get; set; }

    /// <summary>Imprimir un código de barras (con el número de venta) en el ticket interno.</summary>
    public bool ValeIncluyeCodigoBarra { get; set; }
}

public sealed class UpdateOrganizationModulesDto
{
    public List<string> CodigosHabilitados { get; set; } = [];
    public List<string> CodigosModulosConTodasFuncionalidades { get; set; } = [];
    public List<string> CodigosFuncionalidadesHabilitadas { get; set; } = [];
    public bool? TurnosRequierenCuadratura { get; set; }
    public bool? TurnosPermitirMultiplesActivos { get; set; }
    public bool? BitacoraIncluyeCalibracion { get; set; }
    // Ajustes del módulo Punto de venta.
    public bool? PosAgruparPorCategoria { get; set; }
    public string? PosOrdenProductos { get; set; }
    public string? PosOrdenDireccion { get; set; }
    public bool? PosMostrarBuscador { get; set; }
    public bool? PosMostrarCategorias { get; set; }
    public bool? PosPermitirVentaSinStock { get; set; }
    // Ajustes del módulo Caja.
    public bool? CajaMostrarBotonesEfectivo { get; set; }
    public bool? CajaRequiereCuadratura { get; set; }
    public bool? CajaPropinasHabilitadas { get; set; }
    public string? JornadaHoraApertura { get; set; }
    public string? JornadaHoraCierre { get; set; }
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
    public bool TodasFuncionalidadesHabilitadas { get; set; } = true;
    public List<ModuleFeatureDto> Funcionalidades { get; set; } = [];
}

public sealed class ModuleFeatureDto
{
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string Grupo { get; set; } = string.Empty;
    public bool EsCritico { get; set; }
    public bool Habilitada { get; set; } = true;
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
