using System.Text.RegularExpressions;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/organization-configuration")]
public sealed class OrganizationConfigurationController(SgalContext context) : ControllerBase
{
    private const int SingletonId = 1;
    private const long MaxLogoBytes = 2 * 1024 * 1024;
    private static readonly Regex HexColor = new("^#[0-9A-Fa-f]{6}$", RegexOptions.Compiled);
    private static readonly HashSet<string> AllowedLogoTypes =
        ["image/png", "image/jpeg"];

    [AllowAnonymous]
    [HttpGet("public")]
    public async Task<IActionResult> GetPublicConfiguration()
    {
        var branding = await context.OrgConfiguracion.AsNoTracking()
            .Where(x => x.IdConfiguracion == SingletonId)
            .Select(x => new
            {
                x.NombreComercial,
                x.RazonSocial,
                x.Descripcion,
                x.TextoPieDocumentos,
                x.ContactoPublico,
                x.ColorPrimario,
                x.ColorSecundario,
                x.ColorAcento,
                x.ColorFondo,
                TieneLogo = x.LogoContenido != null,
                LogoVersion = x.FechaActualizacion.Ticks
            })
            .FirstOrDefaultAsync();

        var modules = await EnabledModuleCodes().ToListAsync();
        return Ok(new
        {
            Branding = branding ?? DefaultBranding(),
            ModulosHabilitados = modules
        });
    }

    [AllowAnonymous]
    [HttpGet("logo")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetLogo()
    {
        var logo = await context.OrgConfiguracion.AsNoTracking()
            .Where(x => x.IdConfiguracion == SingletonId && x.LogoContenido != null)
            .Select(x => new { x.LogoContenido, x.LogoTipoContenido, x.LogoNombreArchivo })
            .FirstOrDefaultAsync();

        if (logo?.LogoContenido == null) return NotFound();
        return File(logo.LogoContenido, logo.LogoTipoContenido ?? "application/octet-stream", logo.LogoNombreArchivo);
    }

    [HttpGet("branding")]
    [Permission(Permissions.SystemBrandingView)]
    public async Task<IActionResult> GetBranding()
    {
        var branding = await context.OrgConfiguracion.AsNoTracking()
            .Where(x => x.IdConfiguracion == SingletonId)
            .Select(x => new
            {
                x.NombreComercial,
                x.RazonSocial,
                x.Descripcion,
                x.TextoPieDocumentos,
                x.ContactoPublico,
                x.ColorPrimario,
                x.ColorSecundario,
                x.ColorAcento,
                x.ColorFondo,
                TieneLogo = x.LogoContenido != null,
                x.LogoNombreArchivo,
                x.FechaActualizacion
            })
            .FirstOrDefaultAsync();

        return Ok(branding ?? DefaultBranding());
    }

    [HttpPut("branding")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> UpdateBranding(UpdateOrganizationBrandingDto dto)
    {
        var colors = new[] { dto.ColorPrimario, dto.ColorSecundario, dto.ColorAcento, dto.ColorFondo };
        if (colors.Any(color => !HexColor.IsMatch(color)))
            return BadRequest(new { Mensaje = "Cada color debe usar el formato hexadecimal #RRGGBB." });

        var branding = await context.OrgConfiguracion.FindAsync(SingletonId);
        if (branding == null)
        {
            branding = new OrgConfiguracion { IdConfiguracion = SingletonId };
            context.OrgConfiguracion.Add(branding);
        }

        branding.NombreComercial = dto.NombreComercial.Trim();
        branding.RazonSocial = Clean(dto.RazonSocial);
        branding.Descripcion = Clean(dto.Descripcion);
        branding.TextoPieDocumentos = Clean(dto.TextoPieDocumentos);
        branding.ContactoPublico = Clean(dto.ContactoPublico);
        branding.ColorPrimario = dto.ColorPrimario.ToUpperInvariant();
        branding.ColorSecundario = dto.ColorSecundario.ToUpperInvariant();
        branding.ColorAcento = dto.ColorAcento.ToUpperInvariant();
        branding.ColorFondo = dto.ColorFondo.ToUpperInvariant();
        branding.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("branding/logo")]
    [Permission(Permissions.SystemBrandingEdit)]
    [RequestSizeLimit(MaxLogoBytes + 65536)]
    public async Task<IActionResult> UploadLogo(IFormFile file)
    {
        if (file.Length == 0) return BadRequest(new { Mensaje = "El archivo está vacío." });
        if (file.Length > MaxLogoBytes) return BadRequest(new { Mensaje = "El logo no puede superar 2 MB." });
        if (!AllowedLogoTypes.Contains(file.ContentType))
            return BadRequest(new { Mensaje = "El logo debe ser PNG o JPEG." });

        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer);
        var logoBytes = buffer.ToArray();
        if (!HasValidImageSignature(logoBytes, file.ContentType))
            return BadRequest(new { Mensaje = "El contenido del archivo no corresponde a una imagen PNG o JPEG válida." });

        var branding = await context.OrgConfiguracion.FindAsync(SingletonId);
        if (branding == null)
        {
            branding = NewDefaultBranding();
            context.OrgConfiguracion.Add(branding);
        }

        branding.LogoContenido = logoBytes;
        branding.LogoTipoContenido = file.ContentType;
        branding.LogoNombreArchivo = Path.GetFileName(file.FileName);
        branding.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("branding/logo")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> DeleteLogo()
    {
        var branding = await context.OrgConfiguracion.FindAsync(SingletonId);
        if (branding == null) return NoContent();
        branding.LogoContenido = null;
        branding.LogoTipoContenido = null;
        branding.LogoNombreArchivo = null;
        branding.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("modules")]
    [Permission(Permissions.SystemModulesManage)]
    public async Task<IActionResult> GetModules()
    {
        var modules = await context.SegModulos.AsNoTracking()
            .Where(x => x.Activo)
            .OrderBy(x => x.Orden)
            .Select(x => new
            {
                x.Codigo,
                x.Nombre,
                x.Descripcion,
                x.EsNucleo,
                Habilitado = x.EsNucleo || (x.ConfiguracionOrganizacion != null && x.ConfiguracionOrganizacion.Habilitado),
                Dependencias = x.Dependencias
                    .Select(d => d.ModuloRequerido.Codigo)
                    .OrderBy(c => c)
                    .ToList(),
                CantidadPermisos = x.Permisos.Count(p => p.Activo)
            })
            .ToListAsync();
        return Ok(modules);
    }

    [HttpPut("modules")]
    [Permission(Permissions.SystemModulesManage)]
    public async Task<IActionResult> UpdateModules(UpdateOrganizationModulesDto dto)
    {
        var requested = dto.CodigosHabilitados
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToLowerInvariant())
            .ToHashSet();

        var modules = await context.SegModulos.Where(x => x.Activo)
            .Include(x => x.ConfiguracionOrganizacion).ToListAsync();
        var unknown = requested.Except(modules.Select(x => x.Codigo)).ToList();
        if (unknown.Count != 0)
            return BadRequest(new { Mensaje = $"Módulos desconocidos: {string.Join(", ", unknown)}" });

        var coreCodes = modules.Where(x => x.EsNucleo).Select(x => x.Codigo).ToHashSet();
        var selected = requested.Concat(coreCodes).ToHashSet();
        var missingDependencies = await context.SegModulosDependencias.AsNoTracking()
            .Where(x => selected.Contains(x.Modulo.Codigo) && !selected.Contains(x.ModuloRequerido.Codigo))
            .Select(x => new { Modulo = x.Modulo.Codigo, Requerido = x.ModuloRequerido.Codigo })
            .ToListAsync();
        if (missingDependencies.Count != 0)
            return BadRequest(new
            {
                Mensaje = "La selección no cumple las dependencias entre módulos.",
                DependenciasFaltantes = missingDependencies
            });

        foreach (var module in modules)
        {
            var enabled = module.EsNucleo || requested.Contains(module.Codigo);
            if (module.ConfiguracionOrganizacion == null)
                context.OrgModulos.Add(new OrgModulo
                {
                    IdModulo = module.IdModulo,
                    Habilitado = enabled,
                    FechaActualizacion = DateTime.UtcNow
                });
            else
            {
                module.ConfiguracionOrganizacion.Habilitado = enabled;
                module.ConfiguracionOrganizacion.FechaActualizacion = DateTime.UtcNow;
            }
        }

        await context.SaveChangesAsync();
        return Ok(new { ModulosHabilitados = await EnabledModuleCodes().ToListAsync() });
    }

    private IQueryable<string> EnabledModuleCodes() => context.SegModulos.AsNoTracking()
        .Where(x => x.Activo && (x.EsNucleo || (x.ConfiguracionOrganizacion != null && x.ConfiguracionOrganizacion.Habilitado)))
        .OrderBy(x => x.Orden)
        .Select(x => x.Codigo);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool HasValidImageSignature(byte[] bytes, string contentType) => contentType switch
    {
        "image/png" => bytes.Length >= 8
            && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
            && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A,
        "image/jpeg" => bytes.Length >= 4
            && bytes[0] == 0xFF && bytes[1] == 0xD8
            && bytes[^2] == 0xFF && bytes[^1] == 0xD9,
        _ => false
    };

    private static object DefaultBranding() => new
    {
        NombreComercial = "SGAL App",
        RazonSocial = (string?)null,
        Descripcion = "Sistema de Gestión, Administración y Logística",
        TextoPieDocumentos = "Gracias por su preferencia.",
        ContactoPublico = (string?)null,
        ColorPrimario = "#1F4E5F",
        ColorSecundario = "#163A47",
        ColorAcento = "#D97706",
        ColorFondo = "#F8FAFC",
        TieneLogo = false,
        LogoVersion = 0L
    };

    private static OrgConfiguracion NewDefaultBranding() => new()
    {
        IdConfiguracion = SingletonId,
        NombreComercial = "SGAL App",
        Descripcion = "Sistema de Gestión, Administración y Logística",
        TextoPieDocumentos = "Gracias por su preferencia.",
        FechaActualizacion = DateTime.UtcNow
    };
}
