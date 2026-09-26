using System.Data.Common;
using System.Text.RegularExpressions;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/organization-configuration")]
public sealed class OrganizationConfigurationController(SgalContext context, IOptions<LicensingOptions> licensing) : ControllerBase
{
    private const int SingletonId = 1;
    private const long MaxLogoBytes = 2 * 1024 * 1024;
    private static readonly Regex HexColor = new("^#[0-9A-Fa-f]{6}$", RegexOptions.Compiled);
    private static readonly HashSet<string> AllowedLogoTypes =
        ["image/png", "image/jpeg"];
    private static readonly LogoLocationDefinition[] LogoLocations =
    [
        new("login", "Inicio de sesión", "Pantallas de acceso y configuración inicial."),
        new("sidebar", "Menú lateral", "Identidad principal del menú de navegación."),
        new("punto_venta", "Punto de venta", "Cabecera de la pantalla de ventas."),
        new("boletas", "Boletas y comprobantes", "Comprobantes impresos desde el punto de venta."),
        new("documentos", "Documentos", "Órdenes de compra y otras exportaciones PDF."),
        new("favicon", "Favicon", "Icono mostrado en la pestaña del navegador.")
    ];
    private static readonly HashSet<string> LogoLocationCodes =
        LogoLocations.Select(x => x.Codigo).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private const long MaxBackgroundBytes = 6 * 1024 * 1024;
    // Zonas con fondo personalizable y sus dimensiones exactas obligatorias (ancho x alto).
    private static readonly Dictionary<string, BackgroundZoneDefinition> BackgroundZones = new(StringComparer.OrdinalIgnoreCase)
    {
        ["login"] = new(1920, 1080, "configuracion_sistema"),
        ["sidebar"] = new(600, 2024, "configuracion_sistema"),
        ["ventas"] = new(1920, 1080, "ventas"),
        ["comandas"] = new(1920, 1080, "comandas"),
        ["carta"] = new(1920, 1080, "ventas")
    };

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
                x.BoletaMuestraVendedor,
                x.BoletaMuestraPago,
                x.BoletaColaPersonalizada,
                x.ValeIncluyeCodigoBarra,
                x.TurnosRequierenCuadratura,
                x.BitacoraIncluyeCalibracion,
                x.PosAgruparPorCategoria,
                x.PosOrdenProductos,
                x.PosOrdenDireccion,
                x.PosMostrarBuscador,
                x.PosMostrarCategorias,
                x.PosPermitirVentaSinStock,
                x.CajaMostrarBotonesEfectivo,
                x.CajaRequiereCuadratura,
                x.CajaPropinasHabilitadas,
                x.JornadaHoraApertura,
                x.JornadaHoraCierre
            })
            .FirstOrDefaultAsync();

        var modules = await EnabledModuleCodes().ToListAsync();
        var logoAssignments = await context.OrgLogosUbicaciones.AsNoTracking()
            .Select(x => new { x.CodigoUbicacion, x.Logo.FechaActualizacion })
            .ToListAsync();
        var logos = logoAssignments.ToDictionary(x => x.CodigoUbicacion, x => x.FechaActualizacion);

        // Si la migración de fondos aún no se aplicó, no debe romperse la identidad
        // completa: se devuelven sin fondos y la aplicación conserva su apariencia base.
        List<object> fondos;
        try { fondos = await BuildBackgroundsAsync(); }
        catch (DbException) { fondos = []; }

        return Ok(new
        {
            Branding = branding ?? DefaultBranding(),
            Logos = logos,
            ModulosHabilitados = modules,
            Fondos = fondos
        });
    }

    [AllowAnonymous]
    [HttpGet("logo/{ubicacion}")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetLogo(string ubicacion)
    {
        var code = ubicacion.Trim().ToLowerInvariant();
        if (!LogoLocationCodes.Contains(code)) return NotFound();

        var logo = await context.OrgLogosUbicaciones.AsNoTracking()
            .Where(x => x.CodigoUbicacion == code)
            .Select(x => new { x.Logo.Contenido, x.Logo.TipoContenido })
            .FirstOrDefaultAsync();

        if (logo == null) return NotFound();
        return File(logo.Contenido, logo.TipoContenido);
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
                x.BoletaMuestraVendedor,
                x.BoletaMuestraPago,
                x.BoletaColaPersonalizada,
                x.ValeIncluyeCodigoBarra,
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
        branding.BoletaMuestraVendedor = dto.BoletaMuestraVendedor;
        branding.BoletaMuestraPago = dto.BoletaMuestraPago;
        branding.BoletaColaPersonalizada = Clean(dto.BoletaColaPersonalizada);
        branding.ValeIncluyeCodigoBarra = dto.ValeIncluyeCodigoBarra;
        branding.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("branding/logos")]
    [Permission(Permissions.SystemBrandingView)]
    public async Task<IActionResult> GetLogos()
    {
        var logos = await context.OrgLogos.AsNoTracking()
            .OrderBy(x => x.Nombre)
            .ThenBy(x => x.IdLogo)
            .Select(x => new
            {
                x.IdLogo,
                x.Nombre,
                x.NombreArchivo,
                x.TipoContenido,
                x.FechaCreacion,
                x.FechaActualizacion,
                Ubicaciones = x.Ubicaciones
                    .OrderBy(location => location.CodigoUbicacion)
                    .Select(location => location.CodigoUbicacion)
                    .ToList()
            })
            .ToListAsync();

        return Ok(new { Ubicaciones = LogoLocations, Logos = logos });
    }

    [HttpGet("branding/logos/{id:int}/content")]
    [Permission(Permissions.SystemBrandingView)]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetLogoContent(int id)
    {
        var logo = await context.OrgLogos.AsNoTracking()
            .Where(x => x.IdLogo == id)
            .Select(x => new { x.Contenido, x.TipoContenido })
            .FirstOrDefaultAsync();
        if (logo == null) return NotFound();
        return File(logo.Contenido, logo.TipoContenido);
    }

    [HttpPost("branding/logos")]
    [Permission(Permissions.SystemBrandingEdit)]
    [RequestSizeLimit(MaxLogoBytes + 65536)]
    public async Task<IActionResult> UploadLogo([FromForm] IFormFile file, [FromForm] string? nombre)
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

        var fileName = Path.GetFileName(file.FileName);
        if (fileName.Length > 180)
            return BadRequest(new { Mensaje = "El nombre del archivo no puede superar 180 caracteres." });

        var displayName = Clean(nombre) ?? Clean(Path.GetFileNameWithoutExtension(fileName)) ?? "Logo";
        if (displayName.Length > 120)
            return BadRequest(new { Mensaje = "El nombre del logo no puede superar 120 caracteres." });

        var now = DateTime.UtcNow;
        var logo = new OrgLogo
        {
            Nombre = displayName,
            Contenido = logoBytes,
            TipoContenido = file.ContentType,
            NombreArchivo = fileName,
            FechaCreacion = now,
            FechaActualizacion = now
        };
        context.OrgLogos.Add(logo);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetLogoContent), new { id = logo.IdLogo }, new { logo.IdLogo });
    }

    [HttpPut("branding/logos/{id:int}/locations")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> UpdateLogoLocations(int id, UpdateLogoLocationsDto dto)
    {
        if (!await context.OrgLogos.AnyAsync(x => x.IdLogo == id)) return NotFound();

        var requested = dto.Ubicaciones
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToLowerInvariant())
            .ToHashSet();
        var unknown = requested.Where(x => !LogoLocationCodes.Contains(x)).ToList();
        if (unknown.Count != 0)
            return BadRequest(new { Mensaje = $"Ubicaciones desconocidas: {string.Join(", ", unknown)}" });

        var assignments = await context.OrgLogosUbicaciones
            .Include(x => x.Logo)
            .Where(x => requested.Contains(x.CodigoUbicacion) || x.IdLogo == id)
            .ToListAsync();
        var conflicts = assignments
            .Where(x => requested.Contains(x.CodigoUbicacion) && x.IdLogo != id)
            .Select(x => new
            {
                CodigoUbicacion = x.CodigoUbicacion,
                NombreUbicacion = LogoLocations.First(location => location.Codigo == x.CodigoUbicacion).Nombre,
                x.IdLogo,
                NombreLogo = x.Logo.Nombre
            })
            .ToList();

        if (conflicts.Count != 0 && !dto.ConfirmarReemplazo)
            return Conflict(new
            {
                Mensaje = "Una o más ubicaciones ya utilizan otro logo. Confirme el reemplazo para continuar.",
                Conflictos = conflicts
            });

        context.OrgLogosUbicaciones.RemoveRange(assignments
            .Where(x => x.IdLogo == id && !requested.Contains(x.CodigoUbicacion)));

        var now = DateTime.UtcNow;
        foreach (var code in requested)
        {
            var assignment = assignments.FirstOrDefault(x => x.CodigoUbicacion == code);
            if (assignment == null)
                context.OrgLogosUbicaciones.Add(new OrgLogoUbicacion
                {
                    CodigoUbicacion = code,
                    IdLogo = id,
                    FechaActualizacion = now
                });
            else if (assignment.IdLogo != id)
            {
                assignment.IdLogo = id;
                assignment.FechaActualizacion = now;
            }
        }

        try
        {
            await context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Conflict(new { Mensaje = "La asignación cambió mientras se guardaba. Recargue los logos e intente nuevamente." });
        }

        return NoContent();
    }

    [HttpDelete("branding/logos/{id:int}")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> DeleteLogo(int id)
    {
        var logo = await context.OrgLogos.FindAsync(id);
        if (logo == null) return NoContent();
        context.OrgLogos.Remove(logo);
        await context.SaveChangesAsync();
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("background/{zona}")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetBackground(string zona)
    {
        var code = zona.Trim().ToLowerInvariant();
        if (!BackgroundZones.ContainsKey(code)) return NotFound();

        // Sirve la imagen si existe; la aplicación decide en el cliente si mostrarla
        // según Habilitado, lo que además permite previsualizarla en administración.
        var fondo = await context.OrgFondos.AsNoTracking()
            .Where(x => x.Zona == code && x.Contenido != null)
            .Select(x => new { x.Contenido, x.TipoContenido })
            .FirstOrDefaultAsync();
        if (fondo?.Contenido == null) return NotFound();
        return File(fondo.Contenido, fondo.TipoContenido ?? "image/png");
    }

    [HttpGet("backgrounds")]
    [Permission(Permissions.SystemBrandingView)]
    public async Task<IActionResult> GetBackgrounds() => Ok(await BuildBackgroundsAsync());

    [HttpPost("backgrounds/{zona}")]
    [Permission(Permissions.SystemBrandingEdit)]
    [RequestSizeLimit(MaxBackgroundBytes + 65536)]
    public async Task<IActionResult> UploadBackground(string zona, [FromForm] IFormFile file)
    {
        var code = zona.Trim().ToLowerInvariant();
        if (!BackgroundZones.TryGetValue(code, out var required))
            return NotFound(new { Mensaje = $"Zona de fondo desconocida: {zona}." });

        if (file.Length == 0) return BadRequest(new { Mensaje = "El archivo está vacío." });
        if (file.Length > MaxBackgroundBytes) return BadRequest(new { Mensaje = "La imagen no puede superar 6 MB." });
        if (!AllowedLogoTypes.Contains(file.ContentType))
            return BadRequest(new { Mensaje = "El fondo debe ser PNG o JPEG." });

        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer);
        var bytes = buffer.ToArray();
        if (!HasValidImageSignature(bytes, file.ContentType))
            return BadRequest(new { Mensaje = "El contenido del archivo no corresponde a una imagen PNG o JPEG válida." });

        var dimensions = TryGetImageDimensions(bytes, file.ContentType);
        if (dimensions == null)
            return BadRequest(new { Mensaje = "No fue posible leer las dimensiones de la imagen." });
        if (dimensions.Value.Ancho != required.Ancho || dimensions.Value.Alto != required.Alto)
            return BadRequest(new
            {
                Mensaje = $"La imagen debe medir exactamente {required.Ancho} x {required.Alto} px. " +
                          $"La imagen cargada mide {dimensions.Value.Ancho} x {dimensions.Value.Alto} px."
            });

        var fondo = await context.OrgFondos.FindAsync(code);
        if (fondo == null)
        {
            fondo = new OrgFondo { Zona = code };
            context.OrgFondos.Add(fondo);
        }

        fondo.Contenido = bytes;
        fondo.TipoContenido = file.ContentType;
        fondo.NombreArchivo = Path.GetFileName(file.FileName);
        fondo.Ancho = dimensions.Value.Ancho;
        fondo.Alto = dimensions.Value.Alto;
        fondo.Habilitado = true; // Subir una imagen la deja activa por defecto.
        fondo.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPut("backgrounds/{zona}/enabled")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> SetBackgroundEnabled(string zona, SetBackgroundEnabledDto dto)
    {
        var code = zona.Trim().ToLowerInvariant();
        if (!BackgroundZones.ContainsKey(code))
            return NotFound(new { Mensaje = $"Zona de fondo desconocida: {zona}." });

        var fondo = await context.OrgFondos.FindAsync(code);
        if (fondo == null || fondo.Contenido == null)
            return BadRequest(new { Mensaje = "Primero debe subir una imagen para esta zona." });

        fondo.Habilitado = dto.Habilitado;
        fondo.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("backgrounds/{zona}")]
    [Permission(Permissions.SystemBrandingEdit)]
    public async Task<IActionResult> DeleteBackground(string zona)
    {
        var code = zona.Trim().ToLowerInvariant();
        if (!BackgroundZones.ContainsKey(code))
            return NotFound(new { Mensaje = $"Zona de fondo desconocida: {zona}." });

        var fondo = await context.OrgFondos.FindAsync(code);
        if (fondo == null) return NoContent();
        fondo.Contenido = null;
        fondo.TipoContenido = null;
        fondo.NombreArchivo = null;
        fondo.Ancho = null;
        fondo.Alto = null;
        fondo.Habilitado = false;
        fondo.FechaActualizacion = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private async Task<List<object>> BuildBackgroundsAsync()
    {
        var enabledModules = await EnabledModuleCodes().ToHashSetAsync();
        var fondos = await context.OrgFondos.AsNoTracking()
            .Select(x => new
            {
                x.Zona,
                x.Habilitado,
                x.Ancho,
                x.Alto,
                x.NombreArchivo,
                x.FechaActualizacion,
                TieneImagen = x.Contenido != null
            })
            .ToListAsync();

        return BackgroundZones
            .Where(zone => enabledModules.Contains(zone.Value.ModuloRequerido))
            .Select(zone =>
        {
            var fondo = fondos.FirstOrDefault(x => x.Zona == zone.Key);
            return (object)new
            {
                Zona = zone.Key,
                AnchoRequerido = zone.Value.Ancho,
                AltoRequerido = zone.Value.Alto,
                Habilitado = fondo?.Habilitado ?? false,
                TieneImagen = fondo?.TieneImagen ?? false,
                fondo?.Ancho,
                fondo?.Alto,
                NombreArchivo = fondo?.NombreArchivo,
                Version = fondo?.FechaActualizacion
            };
        }).ToList();
    }

    // Lee el ancho y alto de una imagen PNG o JPEG a partir de su cabecera.
    private static (int Ancho, int Alto)? TryGetImageDimensions(byte[] bytes, string contentType)
    {
        try
        {
            if (contentType == "image/png")
            {
                if (bytes.Length < 24) return null;
                int width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
                int height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
                return (width, height);
            }

            if (contentType == "image/jpeg")
            {
                int offset = 2; // Salta el marcador de inicio de imagen (0xFFD8).
                while (offset + 9 < bytes.Length)
                {
                    if (bytes[offset] != 0xFF) { offset++; continue; }
                    byte marker = bytes[offset + 1];
                    // Marcadores SOF que contienen las dimensiones (excluye DHT/JPG/DAC).
                    bool isSof = marker is >= 0xC0 and <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
                    if (isSof)
                    {
                        int height = (bytes[offset + 5] << 8) | bytes[offset + 6];
                        int width = (bytes[offset + 7] << 8) | bytes[offset + 8];
                        return (width, height);
                    }
                    int segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
                    if (segmentLength < 2) return null;
                    offset += 2 + segmentLength;
                }
            }
        }
        catch (IndexOutOfRangeException) { return null; }
        return null;
    }

    [HttpGet("modules")]
    [Permission(Permissions.SystemModulesManage)]
    public async Task<IActionResult> GetModules()
        => Ok(new
        {
            Modulos = await BuildModuleCatalogAsync(),
            TurnosRequierenCuadratura = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.TurnosRequierenCuadratura)
                .FirstOrDefaultAsync() ?? true,
            TurnosPermitirMultiplesActivos = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.TurnosPermitirMultiplesActivos)
                .FirstOrDefaultAsync() ?? false,
            BitacoraIncluyeCalibracion = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.BitacoraIncluyeCalibracion)
                .FirstOrDefaultAsync() ?? true,
            PosAgruparPorCategoria = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.PosAgruparPorCategoria)
                .FirstOrDefaultAsync() ?? true,
            PosOrdenProductos = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => x.PosOrdenProductos)
                .FirstOrDefaultAsync() ?? "nombre",
            PosOrdenDireccion = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => x.PosOrdenDireccion)
                .FirstOrDefaultAsync() ?? "asc",
            PosMostrarBuscador = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.PosMostrarBuscador)
                .FirstOrDefaultAsync() ?? true,
            PosMostrarCategorias = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.PosMostrarCategorias)
                .FirstOrDefaultAsync() ?? true,
            PosPermitirVentaSinStock = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.PosPermitirVentaSinStock)
                .FirstOrDefaultAsync() ?? false,
            CajaMostrarBotonesEfectivo = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.CajaMostrarBotonesEfectivo)
                .FirstOrDefaultAsync() ?? true,
            CajaRequiereCuadratura = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.CajaRequiereCuadratura)
                .FirstOrDefaultAsync() ?? true,
            CajaPropinasHabilitadas = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId)
                .Select(x => (bool?)x.CajaPropinasHabilitadas)
                .FirstOrDefaultAsync() ?? false,
            JornadaHoraApertura = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId).Select(x => x.JornadaHoraApertura).FirstOrDefaultAsync(),
            JornadaHoraCierre = await context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == SingletonId).Select(x => x.JornadaHoraCierre).FirstOrDefaultAsync()
        });

    /// <summary>
    /// Catálogo disponible para el primer paso de una instalación nueva. Deja de
    /// estar expuesto tan pronto existe el usuario Desarrollador.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("modules/bootstrap")]
    public async Task<IActionResult> GetBootstrapModules()
    {
        var developerExists = await context.EmpRolesXusuario.AsNoTracking().AnyAsync(rx =>
            rx.Activo && rx.IdRolUsuario == RolesUsuario.Desarrollador && rx.IdUsuarioNavigation.Activo);
        if (developerExists) return NotFound();
        return Ok(await BuildModuleCatalogAsync());
    }

    private async Task<List<ModuleCatalogItemDto>> BuildModuleCatalogAsync()
    {
        // Se materializa el catálogo completo antes de construir el DTO. Así la
        // cantidad y el detalle proceden exactamente de la misma colección y nunca
        // puede mostrarse "4 capacidades" con una lista vacía.
        var modules = await context.SegModulos.AsNoTracking()
            .Where(x => x.Activo)
            .Include(x => x.Dependencias).ThenInclude(x => x.ModuloRequerido)
            .Include(x => x.Permisos)
                .ThenInclude(x => x.ConfiguracionOrganizacion)
            .Include(x => x.ConfiguracionOrganizacion)
            .OrderBy(x => x.Orden)
            .ToListAsync();

        return modules.Select(x =>
        {
            var features = x.Permisos
                .Where(p => p.Activo)
                .OrderBy(p => p.Nombre)
                .Select(p => new ModuleFeatureDto
                {
                    Codigo = p.Codigo,
                    Nombre = p.Nombre,
                    Descripcion = p.Descripcion,
                    Grupo = GetFeatureGroup(x.Codigo, p.Codigo),
                    EsCritico = p.EsCritico,
                    Habilitada = x.ConfiguracionOrganizacion == null
                        || x.ConfiguracionOrganizacion.TodasFuncionalidades
                        || p.ConfiguracionOrganizacion != null
                }).ToList();

            return new ModuleCatalogItemDto
            {
                Codigo = x.Codigo,
                Nombre = x.Nombre,
                Descripcion = x.Descripcion,
                EsNucleo = x.EsNucleo,
                Habilitado = x.EsNucleo || (x.ConfiguracionOrganizacion != null && x.ConfiguracionOrganizacion.Habilitado),
                Dependencias = x.Dependencias
                    .Select(d => d.ModuloRequerido.Codigo)
                    .OrderBy(c => c)
                    .ToList(),
                CantidadPermisos = features.Count,
                TodasFuncionalidadesHabilitadas = x.ConfiguracionOrganizacion?.TodasFuncionalidades ?? true,
                Funcionalidades = features
            };
        }).ToList();
    }

    private static string GetFeatureGroup(string moduleCode, string permissionCode)
    {
        if (moduleCode == "configuracion_sistema")
            return permissionCode.Contains(".modulos.") ? "Módulos de la instalación" : "Identidad de la organización";

        if (moduleCode == "usuarios")
        {
            if (permissionCode.StartsWith("roles.") || permissionCode.StartsWith("usuarios.roles.")) return "Roles y permisos";
            if (permissionCode.StartsWith("usuarios.empleado.") || permissionCode == "usuarios.ver") return "Empleados";
            if (permissionCode.StartsWith("usuarios.password.")) return "Contraseñas";
            return "Cuentas de usuario";
        }

        if (moduleCode == "inventario")
        {
            if (permissionCode.StartsWith("inventario.productos.")) return "Productos";
            if (permissionCode.StartsWith("inventario.categorias.")) return "Categorías de producto";
            return "Inventario simple";
        }

        if (moduleCode == "recetas")
        {
            if (permissionCode.StartsWith("recetas.")) return "Recetas";
            if (permissionCode.StartsWith("ingredientes_extra.")) return "Ingredientes extra";
            if (permissionCode.Contains(".materias_primas.")) return "Materias primas";
            if (permissionCode.Contains(".presentaciones.")) return "Presentaciones";
            if (permissionCode.Contains(".unidades.")) return "Unidades de medida";
            if (permissionCode.Contains(".categorias_materia.")) return "Categorías de materia prima";
            if (permissionCode.Contains(".marcas.")) return "Marcas";
            if (permissionCode.Contains(".stock.")) return "Existencias";
            return "Configuración de materiales";
        }

        if (moduleCode == "ordenes_compra")
            return permissionCode.StartsWith("proveedores.") ? "Proveedores" : "Órdenes de compra";

        if (moduleCode == "turnos")
        {
            if (permissionCode.StartsWith("registros_turnos.")) return "Registros administrativos";
            if (permissionCode.StartsWith("bitacora.consumos.")) return "Consumos de usuarios";
            if (permissionCode.Contains(".cortesia.")) return "Cortesías";
            return "Operación de turnos";
        }

        if (moduleCode == "bitacora") return "Bitácora";
        if (moduleCode == "comandas") return "Comandas";

        if (moduleCode == "caja")
        {
            if (permissionCode.StartsWith("caja.turno.")) return "Turno de caja";
            return "Cobro";
        }

        if (moduleCode == "ventas")
        {
            if (permissionCode == "inicio.dashboard.ver") return "Panel administrativo";
            if (permissionCode.StartsWith("turnos.")) return "Operación de turnos";
            if (permissionCode.StartsWith("registros_turnos.")) return "Registros administrativos";
            if (permissionCode.StartsWith("bitacora.consumos.")) return "Consumos de usuarios";
            if (permissionCode.StartsWith("bitacora.")) return "Bitácora";
            if (permissionCode.Contains(".cortesia.")) return "Cortesías";
            if (permissionCode.StartsWith("inventario.descuentos.") || permissionCode == "ventas.descuento.aplicar") return "Descuentos";
            if (permissionCode.StartsWith("ingredientes_extra.")) return "Ingredientes extra";
            if (permissionCode.StartsWith("ventas.documentos.")) return "Comprobantes";
            if (permissionCode.StartsWith("ventas.promociones.")) return "Promociones";
            return "Punto de venta";
        }

        return "Otras funcionalidades";
    }

    [HttpPut("modules")]
    [Permission(Permissions.SystemModulesManage)]
    public async Task<IActionResult> UpdateModules(UpdateOrganizationModulesDto dto)
    {
        // Con licenciamiento activo, los módulos los define el token de la License API (Org_Modulos
        // es un espejo que se sincroniza en cada check-in). Se ignoran los cambios de módulos aquí,
        // pero los ajustes operativos (turnos/POS/caja) sí se aplican.
        if (!licensing.Value.Enabled)
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
        var unknownAllFeatureModules = dto.CodigosModulosConTodasFuncionalidades
            .Except(modules.Select(module => module.Codigo), StringComparer.OrdinalIgnoreCase).ToList();
        if (unknownAllFeatureModules.Count != 0)
            return BadRequest(new { Mensaje = $"Módulos desconocidos en la configuración de funcionalidades: {string.Join(", ", unknownAllFeatureModules)}" });

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
            var allFeatures = dto.CodigosModulosConTodasFuncionalidades.Contains(module.Codigo, StringComparer.OrdinalIgnoreCase);
            if (module.ConfiguracionOrganizacion == null)
                context.OrgModulos.Add(new OrgModulo
                {
                    IdModulo = module.IdModulo,
                    Habilitado = enabled,
                    TodasFuncionalidades = allFeatures,
                    FechaActualizacion = DateTime.UtcNow
                });
            else
            {
                module.ConfiguracionOrganizacion.Habilitado = enabled;
                module.ConfiguracionOrganizacion.TodasFuncionalidades = allFeatures;
                module.ConfiguracionOrganizacion.FechaActualizacion = DateTime.UtcNow;
            }
        }

        var requestedFeatures = dto.CodigosFuncionalidadesHabilitadas
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var activePermissions = await context.SegPermisos
            .Where(permission => permission.Activo)
            .Select(permission => new { permission.IdPermiso, permission.Codigo, Modulo = permission.Modulo.Codigo })
            .ToListAsync();
        var unknownFeatures = requestedFeatures.Except(activePermissions.Select(permission => permission.Codigo), StringComparer.OrdinalIgnoreCase).ToList();
        if (unknownFeatures.Count != 0)
            return BadRequest(new { Mensaje = $"Funcionalidades desconocidas: {string.Join(", ", unknownFeatures)}" });

        var selectiveModulesWithoutFeatures = activePermissions
            .Where(permission => selected.Contains(permission.Modulo))
            .Select(permission => permission.Modulo).Distinct()
            .Where(moduleCode => !dto.CodigosModulosConTodasFuncionalidades.Contains(moduleCode, StringComparer.OrdinalIgnoreCase)
                && !activePermissions.Any(permission => permission.Modulo == moduleCode && requestedFeatures.Contains(permission.Codigo)))
            .ToList();
        if (selectiveModulesWithoutFeatures.Count != 0)
            return BadRequest(new { Mensaje = $"Selecciona al menos una funcionalidad para: {string.Join(", ", selectiveModulesWithoutFeatures)}" });

        var enabledFeatureIds = activePermissions
            .Where(permission => selected.Contains(permission.Modulo)
                && requestedFeatures.Contains(permission.Codigo)
                && !dto.CodigosModulosConTodasFuncionalidades.Contains(permission.Modulo, StringComparer.OrdinalIgnoreCase))
            .Select(permission => permission.IdPermiso)
            .ToHashSet();
        var currentFeatureConfiguration = await context.OrgPermisos.ToListAsync();
        context.OrgPermisos.RemoveRange(currentFeatureConfiguration.Where(item => !enabledFeatureIds.Contains(item.IdPermiso)));
        var currentFeatureIds = currentFeatureConfiguration.Select(item => item.IdPermiso).ToHashSet();
        context.OrgPermisos.AddRange(enabledFeatureIds.Where(id => !currentFeatureIds.Contains(id)).Select(id => new OrgPermiso
        {
            IdPermiso = id,
            FechaActualizacion = DateTime.UtcNow
        }));

        if (!selected.Contains("recetas"))
        {
            await context.InvProductos
                .Where(product => product.Stock == null || product.RequiereReceta == true || product.AceptaIngredientesExtra)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(product => product.Stock, product => product.Stock ?? 0)
                    .SetProperty(product => product.RequiereReceta, false)
                    .SetProperty(product => product.AceptaIngredientesExtra, false)
                    .SetProperty(product => product.FechaModificacion, DateTime.Now));
            await context.InvRecetas.Where(recipe => recipe.Estado)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(recipe => recipe.Estado, false)
                    .SetProperty(recipe => recipe.FechaModificacion, DateTime.Now));
        }
        } // fin del bloque de módulos (solo cuando el licenciamiento está apagado)

        if (dto.TurnosRequierenCuadratura.HasValue)
        {
            var configuration = await context.OrgConfiguracion.FindAsync(SingletonId);
            if (configuration != null)
            {
                configuration.TurnosRequierenCuadratura = dto.TurnosRequierenCuadratura.Value;
                configuration.FechaActualizacion = DateTime.UtcNow;
            }
        }
        if (dto.TurnosPermitirMultiplesActivos.HasValue)
        {
            var configuration = await context.OrgConfiguracion.FindAsync(SingletonId);
            if (configuration != null)
            {
                configuration.TurnosPermitirMultiplesActivos = dto.TurnosPermitirMultiplesActivos.Value;
                configuration.FechaActualizacion = DateTime.UtcNow;
            }
        }
        if (dto.BitacoraIncluyeCalibracion.HasValue)
        {
            var configuration = await context.OrgConfiguracion.FindAsync(SingletonId);
            if (configuration != null)
            {
                configuration.BitacoraIncluyeCalibracion = dto.BitacoraIncluyeCalibracion.Value;
                configuration.FechaActualizacion = DateTime.UtcNow;
            }
            if (!dto.BitacoraIncluyeCalibracion.Value)
                await context.InvMateriaPrima.Where(material => material.EsCafeCalibrable)
                    .ExecuteUpdateAsync(update => update.SetProperty(material => material.EsCafeCalibrable, false));
        }

        // Ajustes de presentación del catálogo en el Punto de venta.
        if (dto.PosAgruparPorCategoria.HasValue || dto.PosOrdenProductos != null || dto.PosOrdenDireccion != null
            || dto.PosMostrarBuscador.HasValue || dto.PosMostrarCategorias.HasValue || dto.PosPermitirVentaSinStock.HasValue)
        {
            var ordenValido = new[] { "nombre", "precio", "vendidos", "stock" };
            var configuration = await context.OrgConfiguracion.FindAsync(SingletonId);
            if (configuration != null)
            {
                if (dto.PosAgruparPorCategoria.HasValue)
                    configuration.PosAgruparPorCategoria = dto.PosAgruparPorCategoria.Value;
                if (dto.PosOrdenProductos != null)
                {
                    var orden = dto.PosOrdenProductos.Trim().ToLowerInvariant();
                    configuration.PosOrdenProductos = ordenValido.Contains(orden) ? orden : "nombre";
                }
                if (dto.PosOrdenDireccion != null)
                    configuration.PosOrdenDireccion = dto.PosOrdenDireccion.Trim().ToLowerInvariant() == "desc" ? "desc" : "asc";
                if (dto.PosMostrarBuscador.HasValue)
                    configuration.PosMostrarBuscador = dto.PosMostrarBuscador.Value;
                if (dto.PosMostrarCategorias.HasValue)
                    configuration.PosMostrarCategorias = dto.PosMostrarCategorias.Value;
                if (dto.PosPermitirVentaSinStock.HasValue)
                    configuration.PosPermitirVentaSinStock = dto.PosPermitirVentaSinStock.Value;
                configuration.FechaActualizacion = DateTime.UtcNow;
            }
        }

        // Ajustes del módulo Caja.
        if (dto.CajaMostrarBotonesEfectivo.HasValue || dto.CajaRequiereCuadratura.HasValue
            || dto.CajaPropinasHabilitadas.HasValue || dto.JornadaHoraApertura != null || dto.JornadaHoraCierre != null)
        {
            var configuration = await context.OrgConfiguracion.FindAsync(SingletonId);
            if (configuration != null)
            {
                if (dto.CajaMostrarBotonesEfectivo.HasValue)
                    configuration.CajaMostrarBotonesEfectivo = dto.CajaMostrarBotonesEfectivo.Value;
                if (dto.CajaRequiereCuadratura.HasValue)
                    configuration.CajaRequiereCuadratura = dto.CajaRequiereCuadratura.Value;
                if (dto.CajaPropinasHabilitadas.HasValue)
                    configuration.CajaPropinasHabilitadas = dto.CajaPropinasHabilitadas.Value;
                if (dto.JornadaHoraApertura != null)
                {
                    if (!TimeSpan.TryParse(dto.JornadaHoraApertura, out var opening))
                        return BadRequest(new { Mensaje = "La hora de apertura no es válida." });
                    configuration.JornadaHoraApertura = opening;
                }
                if (dto.JornadaHoraCierre != null)
                {
                    if (!TimeSpan.TryParse(dto.JornadaHoraCierre, out var closing))
                        return BadRequest(new { Mensaje = "La hora de cierre no es válida." });
                    configuration.JornadaHoraCierre = closing;
                }
                configuration.FechaActualizacion = DateTime.UtcNow;
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
        BoletaMuestraVendedor = true,
        BoletaMuestraPago = true,
        BoletaColaPersonalizada = (string?)null,
        ValeIncluyeCodigoBarra = false,
        TurnosRequierenCuadratura = true,
        TurnosPermitirMultiplesActivos = false,
        BitacoraIncluyeCalibracion = true,
        PosAgruparPorCategoria = true,
        PosOrdenProductos = "nombre",
        PosOrdenDireccion = "asc",
        PosMostrarBuscador = true,
        PosMostrarCategorias = true,
        PosPermitirVentaSinStock = false,
        CajaMostrarBotonesEfectivo = true,
        CajaRequiereCuadratura = true,
        CajaPropinasHabilitadas = false,
        JornadaHoraApertura = new TimeSpan(6, 0, 0),
        JornadaHoraCierre = new TimeSpan(2, 0, 0)
    };

    private sealed record LogoLocationDefinition(string Codigo, string Nombre, string Descripcion);
    private sealed record BackgroundZoneDefinition(int Ancho, int Alto, string ModuloRequerido);
}
