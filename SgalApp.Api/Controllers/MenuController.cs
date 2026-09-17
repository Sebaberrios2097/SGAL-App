using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Controllers;

// Carta pública de productos. No exige autenticación ni permisos: se muestra si el
// módulo de ventas está habilitado y existen productos activos. Pensada para
// clientes que acceden mediante un enlace (por ejemplo, desde un código QR).
[ApiController]
[Route("api/menu")]
[AllowAnonymous]
public sealed class MenuController(SgalContext context) : ControllerBase
{
    private const string SalesModuleCode = "ventas";

    [HttpGet]
    public async Task<IActionResult> GetMenu()
    {
        var salesEnabled = await context.SegModulos.AsNoTracking()
            .AnyAsync(x => x.Codigo == SalesModuleCode && x.Activo
                && (x.EsNucleo || (x.ConfiguracionOrganizacion != null && x.ConfiguracionOrganizacion.Habilitado)));

        if (!salesEnabled)
            return Ok(new { Disponible = false, Motivo = "modulo", Categorias = Array.Empty<object>() });

        var productos = await context.InvProductos.AsNoTracking()
            .Where(p => p.Activo)
            .Select(p => new
            {
                p.IdProducto,
                p.IdCategoriaProducto,
                Categoria = p.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                CategoriaFecha = p.IdCategoriaProductoNavigation.FechaIngreso,
                p.NombreProducto,
                p.DescripcionProducto,
                p.Precio,
                p.Stock,
                TieneImagen = p.Imagen != null
            })
            .ToListAsync();

        if (productos.Count == 0)
            return Ok(new { Disponible = false, Motivo = "sin_productos", Categorias = Array.Empty<object>() });

        var categorias = productos
            .GroupBy(p => new { p.IdCategoriaProducto, p.Categoria, p.CategoriaFecha })
            .OrderByDescending(g => g.Key.CategoriaFecha)
            .ThenBy(g => g.Key.Categoria)
            .Select(g => new
            {
                IdCategoria = g.Key.IdCategoriaProducto,
                Nombre = g.Key.Categoria,
                Productos = g
                    .OrderBy(p => p.NombreProducto)
                    .Select(p => new
                    {
                        p.IdProducto,
                        Nombre = p.NombreProducto,
                        Descripcion = p.DescripcionProducto,
                        p.Precio,
                        p.Stock,
                        p.TieneImagen
                    })
                    .ToList()
            })
            .ToList();

        return Ok(new { Disponible = true, Categorias = categorias });
    }

    [HttpGet("product/{id:int}/image")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Client)]
    public async Task<IActionResult> GetProductImage(int id)
    {
        var imagen = await context.InvProductos.AsNoTracking()
            .Where(p => p.IdProducto == id && p.Activo && p.Imagen != null)
            .Select(p => p.Imagen)
            .FirstOrDefaultAsync();

        if (imagen == null || imagen.Length == 0) return NotFound();
        return File(imagen, DetectImageType(imagen));
    }

    // Los productos guardan la imagen como bytes sin tipo MIME; se infiere de la
    // firma del archivo (PNG o, por defecto, JPEG).
    private static string DetectImageType(byte[] bytes) =>
        bytes.Length >= 8
            && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
            ? "image/png"
            : "image/jpeg";
}
