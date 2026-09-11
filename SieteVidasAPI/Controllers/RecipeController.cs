using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.Security;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/recipe")]
    public class RecipeController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public RecipeController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetAll()
        {
            var recipes = await _context.InvRecetas.AsNoTracking()
                .OrderBy(x => x.IdProductoNavigation.NombreProducto)
                .Select(x => new
                {
                    x.IdReceta,
                    x.IdProducto,
                    NombreProducto = x.IdProductoNavigation.NombreProducto,
                    x.Estado,
                    x.FechaCreacion,
                    x.FechaModificacion,
                    Materiales = x.InvMaterialesReceta
                        .OrderBy(m => m.IdMateriaPrimaNavigation.NombreMaterial)
                        .Select(m => new
                        {
                            m.IdMateriaPrima,
                            NombreMaterial = m.IdMateriaPrimaNavigation.NombreMaterial,
                            m.CantidadRequerida,
                            m.IdUnidadMedida,
                            NombreUnidad = m.IdUnidadMedidaNavigation.NombreUnidadMedida,
                            AbreviacionUnidad = m.IdUnidadMedidaNavigation.Abreviacion,
                            m.IdMateriaPrimaReemplazada,
                            NombreMateriaPrimaReemplazada = m.IdMateriaPrimaReemplazadaNavigation != null
                                ? m.IdMateriaPrimaReemplazadaNavigation.NombreMaterial
                                : null,
                            m.Recargo,
                            m.UsaMismaMedidaQuePrincipal
                        }).ToList()
                }).ToListAsync();

            return Ok(recipes);
        }

        [HttpGet("product/{idProducto:int}")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetByProduct(int idProducto)
        {
            var product = await _context.InvProductos.AsNoTracking()
                .Where(x => x.IdProducto == idProducto)
                .Select(x => new
                {
                    x.IdProducto,
                    x.NombreProducto,
                    RequiereReceta = x.RequiereReceta ?? false
                }).FirstOrDefaultAsync();
            if (product == null) return NotFound(new { mensaje = "Producto no encontrado." });

            var recipe = await _context.InvRecetas.AsNoTracking()
                .Where(x => x.IdProducto == idProducto && x.Estado)
                .Select(x => new
                {
                    x.IdReceta,
                    x.FechaCreacion,
                    x.FechaModificacion,
                    Materiales = x.InvMaterialesReceta.Select(m => new
                    {
                        m.IdMateriaPrima,
                        m.IdUnidadMedida,
                        NombreUnidad = m.IdUnidadMedidaNavigation.NombreUnidadMedida,
                        AbreviacionUnidad = m.IdUnidadMedidaNavigation.Abreviacion,
                        m.CantidadRequerida,
                        m.IdMateriaPrimaReemplazada,
                        NombreMateriaPrimaReemplazada = m.IdMateriaPrimaReemplazadaNavigation != null
                            ? m.IdMateriaPrimaReemplazadaNavigation.NombreMaterial
                            : null,
                        m.Recargo,
                        m.UsaMismaMedidaQuePrincipal
                    }).ToList()
                }).FirstOrDefaultAsync();

            return Ok(new { Producto = product, Receta = recipe });
        }

        [HttpPut("product/{idProducto:int}")]
        [Permission(Permissions.RecipesEdit)]
        public async Task<IActionResult> Save(int idProducto, [FromBody] RecipeUpdateDto dto)
        {
            var product = await _context.InvProductos.FindAsync(idProducto);
            if (product == null) return NotFound(new { mensaje = "Producto no encontrado." });
            if (product.RequiereReceta != true)
                return BadRequest(new { mensaje = "El producto no está marcado como producto con receta." });

            var materials = dto.Materiales
                .GroupBy(x => x.IdMateriaPrima)
                .Select(x => x.First())
                .ToList();
            if (materials.Count == 0) return BadRequest(new { mensaje = "Debe seleccionar al menos una materia prima." });
            if (materials.Any(x => x.Recargo < 0))
                return BadRequest(new { mensaje = "El recargo de una materia prima no puede ser negativo." });

            var ids = materials.Select(x => x.IdMateriaPrima).ToList();
            var rawMaterials = await _context.InvMateriaPrima.AsNoTracking()
                .Include(x => x.IdUnidadMedidaNavigation)
                .Where(x => ids.Contains(x.IdMateriaPrima))
                .ToDictionaryAsync(x => x.IdMateriaPrima);
            if (rawMaterials.Count != ids.Count)
                return BadRequest(new { mensaje = "Una o más materias primas no son válidas." });
            var selectedIds = ids.ToHashSet();
            foreach (var alternative in materials.Where(x => x.IdMateriaPrimaReemplazada.HasValue))
            {
                if (alternative.IdMateriaPrimaReemplazada == alternative.IdMateriaPrima)
                    return BadRequest(new { mensaje = "Una materia prima no puede ser alternativa de sí misma." });
                if (!selectedIds.Contains(alternative.IdMateriaPrimaReemplazada!.Value))
                    return BadRequest(new { mensaje = "La materia prima principal de cada alternativa debe formar parte de la receta." });

                var baseMaterial = materials.First(x => x.IdMateriaPrima == alternative.IdMateriaPrimaReemplazada.Value);
                if (baseMaterial.IdMateriaPrimaReemplazada.HasValue)
                    return BadRequest(new { mensaje = "No se permiten cadenas de alternativas. La materia principal no puede reemplazar a otra." });

                if (alternative.UsaMismaMedidaQuePrincipal)
                {
                    alternative.CantidadRequerida = baseMaterial.CantidadRequerida;
                    alternative.IdUnidadMedida = baseMaterial.IdUnidadMedida;
                }
            }

            if (materials.Any(x => x.CantidadRequerida <= 0))
                return BadRequest(new { mensaje = "La cantidad requerida de cada materia prima debe ser mayor que cero." });

            var unitIds = materials.Select(x => x.IdUnidadMedida).Distinct().ToList();
            var units = await _context.InvUnidadesMedida.AsNoTracking()
                .Where(x => unitIds.Contains(x.IdUnidadMedida))
                .ToDictionaryAsync(x => x.IdUnidadMedida);
            if (units.Count != unitIds.Count)
                return BadRequest(new { mensaje = "Una o más unidades de medida no son válidas." });

            foreach (var material in materials)
            {
                var recipeUnit = units[material.IdUnidadMedida];
                var stockUnit = rawMaterials[material.IdMateriaPrima].IdUnidadMedidaNavigation;
                if (recipeUnit.TipoMagnitud != stockUnit.TipoMagnitud)
                    return BadRequest(new { mensaje = $"La unidad {recipeUnit.Abreviacion} no es compatible con {rawMaterials[material.IdMateriaPrima].NombreMaterial}." });
                if (recipeUnit.TipoMagnitud == "Unidad" && decimal.Truncate(material.CantidadRequerida) != material.CantidadRequerida)
                    return BadRequest(new { mensaje = $"La cantidad de {rawMaterials[material.IdMateriaPrima].NombreMaterial} debe ser un número entero." });
            }

            await using var transaction = await _context.Database.BeginTransactionAsync();
            var recipe = await _context.InvRecetas
                .Include(x => x.InvMaterialesReceta)
                .FirstOrDefaultAsync(x => x.IdProducto == idProducto && x.Estado);

            if (recipe == null)
            {
                recipe = new InvRecetas
                {
                    IdProducto = idProducto,
                    Estado = true,
                    FechaCreacion = DateTime.Now
                };
                _context.InvRecetas.Add(recipe);
                await _context.SaveChangesAsync();
            }
            else
            {
                _context.InvMaterialesReceta.RemoveRange(recipe.InvMaterialesReceta);
                recipe.FechaModificacion = DateTime.Now;
            }

            _context.InvMaterialesReceta.AddRange(materials.Select(material => new InvMaterialesReceta
            {
                IdReceta = recipe.IdReceta,
                IdMateriaPrima = material.IdMateriaPrima,
                IdUnidadMedida = material.IdUnidadMedida,
                CantidadRequerida = material.CantidadRequerida,
                IdMateriaPrimaReemplazada = material.IdMateriaPrimaReemplazada,
                Recargo = material.IdMateriaPrimaReemplazada.HasValue ? material.Recargo : 0,
                UsaMismaMedidaQuePrincipal = material.IdMateriaPrimaReemplazada.HasValue && material.UsaMismaMedidaQuePrincipal
            }));
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Receta guardada correctamente.", recipe.IdReceta });
        }
    }
}
