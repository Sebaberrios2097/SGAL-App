using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers
{
    /// <summary>
    /// Promociones (combos): precio propio, grupo base de productos fijos y grupos excluyentes
    /// donde se eligen N opciones (con repetición). Distintas de los descuentos por producto.
    /// </summary>
    [ApiController]
    [Route("api/promotion")]
    public class PromotionController : ControllerBase
    {
        private readonly SgalContext _context;

        public PromotionController(SgalContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.PromotionsView + "|" + Permissions.SalesOperate + "|" + Permissions.SalesCreate + "|" + Permissions.CajaCollect)]
        public async Task<IActionResult> GetAll()
        {
            var promociones = await _context.VenPromociones.AsNoTracking()
                .OrderByDescending(p => p.IdPromocion)
                .Select(p => new
                {
                    p.IdPromocion,
                    p.Nombre,
                    p.Precio,
                    p.Descripcion,
                    p.FechaInicio,
                    p.FechaFin,
                    p.Activo,
                    Grupos = p.Grupos.OrderBy(g => g.Orden).Select(g => new
                    {
                        g.IdGrupo,
                        g.EsBase,
                        g.Nombre,
                        g.CantidadElegir,
                        g.Orden,
                        Productos = g.Productos.Select(gp => new
                        {
                            gp.IdProducto,
                            gp.IdProductoNavigation.NombreProducto,
                            gp.IdProductoNavigation.Precio,
                            gp.Cantidad
                        })
                    })
                })
                .ToListAsync();

            return Ok(promociones);
        }

        [HttpPost]
        [Permission(Permissions.PromotionsCreate)]
        public async Task<IActionResult> Create([FromBody] PromotionUpsertDto dto)
        {
            var error = await ValidateAsync(dto);
            if (error != null) return BadRequest(new { mensaje = error });

            var promo = new VenPromociones { FechaCreacion = DateTime.Now };
            Apply(promo, dto);
            _context.VenPromociones.Add(promo);
            await _context.SaveChangesAsync();

            return Ok(new { promo.IdPromocion });
        }

        [HttpPut("{id:int}")]
        [Permission(Permissions.PromotionsEdit)]
        public async Task<IActionResult> Update(int id, [FromBody] PromotionUpsertDto dto)
        {
            var error = await ValidateAsync(dto);
            if (error != null) return BadRequest(new { mensaje = error });

            var promo = await _context.VenPromociones
                .Include(p => p.Grupos).ThenInclude(g => g.Productos)
                .FirstOrDefaultAsync(p => p.IdPromocion == id);
            if (promo == null) return NotFound(new { mensaje = "Promoción no encontrada." });

            // Se reemplaza toda la configuración de grupos.
            foreach (var grupo in promo.Grupos)
                _context.VenPromocionGrupoProductos.RemoveRange(grupo.Productos);
            _context.VenPromocionGrupos.RemoveRange(promo.Grupos);

            Apply(promo, dto);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        [HttpPut("{id:int}/status")]
        [Permission(Permissions.PromotionsStatusEdit)]
        public async Task<IActionResult> SetStatus(int id, [FromBody] PromotionStatusDto dto)
        {
            var promo = await _context.VenPromociones.FirstOrDefaultAsync(p => p.IdPromocion == id);
            if (promo == null) return NotFound(new { mensaje = "Promoción no encontrada." });
            promo.Activo = dto.Activo;
            await _context.SaveChangesAsync();
            return Ok(new { promo.IdPromocion, promo.Activo });
        }

        [HttpDelete("{id:int}")]
        [Permission(Permissions.PromotionsDelete)]
        public async Task<IActionResult> Delete(int id)
        {
            var promo = await _context.VenPromociones.FirstOrDefaultAsync(p => p.IdPromocion == id);
            if (promo == null) return NotFound(new { mensaje = "Promoción no encontrada." });
            _context.VenPromociones.Remove(promo); // cascada elimina grupos y productos
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Vuelca los datos del DTO a la entidad, reconstruyendo los grupos y productos.
        private static void Apply(VenPromociones promo, PromotionUpsertDto dto)
        {
            promo.Nombre = dto.Nombre.Trim();
            promo.Precio = dto.Precio;
            promo.Descripcion = string.IsNullOrWhiteSpace(dto.Descripcion) ? null : dto.Descripcion.Trim();
            promo.FechaInicio = dto.FechaInicio;
            promo.FechaFin = dto.FechaFin;
            promo.Activo = dto.Activo;
            promo.Grupos = dto.Grupos.Select((g, i) => new VenPromocionGrupos
            {
                EsBase = g.EsBase,
                Nombre = g.Nombre.Trim(),
                CantidadElegir = g.EsBase ? 1 : Math.Max(1, g.CantidadElegir),
                Orden = g.Orden != 0 ? g.Orden : i,
                Productos = g.Productos.Select(gp => new VenPromocionGrupoProductos
                {
                    IdProducto = gp.IdProducto,
                    Cantidad = Math.Max(1, gp.Cantidad)
                }).ToList()
            }).ToList();
        }

        private async Task<string?> ValidateAsync(PromotionUpsertDto dto)
        {
            if (dto == null) return "Datos de la promoción no válidos.";
            if (string.IsNullOrWhiteSpace(dto.Nombre)) return "El nombre de la promoción es obligatorio.";
            if (dto.Precio <= 0) return "El precio de la promoción debe ser mayor a cero.";
            if (dto.Grupos == null || dto.Grupos.Count == 0) return "La promoción debe tener al menos un grupo de productos.";
            if (dto.Grupos.Count(g => g.EsBase) > 1) return "Solo puede haber un grupo base.";

            foreach (var g in dto.Grupos)
            {
                if (string.IsNullOrWhiteSpace(g.Nombre)) return "Cada grupo debe tener un nombre.";
                if (g.Productos == null || g.Productos.Count == 0) return $"El grupo '{g.Nombre}' debe tener al menos un producto.";
                if (!g.EsBase && g.CantidadElegir < 1) return $"El grupo '{g.Nombre}' debe permitir elegir al menos una opción.";
            }

            var ids = dto.Grupos.SelectMany(g => g.Productos).Select(p => p.IdProducto).Distinct().ToList();
            var productos = await _context.InvProductos.AsNoTracking()
                .Where(p => ids.Contains(p.IdProducto) && p.Activo)
                .Select(p => new { p.IdProducto, RequiereReceta = p.RequiereReceta ?? false })
                .ToListAsync();
            if (productos.Count != ids.Count)
                return "Uno o más productos de la promoción no existen o están inactivos.";
            if (productos.Any(p => p.RequiereReceta))
                return "Los productos de una promoción no pueden requerir receta.";

            return null;
        }
    }
}
