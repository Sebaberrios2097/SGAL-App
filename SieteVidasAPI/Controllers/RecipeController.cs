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
                    Nombre = x.IdProductoNavigation.NombreProducto,
                    x.Estado,
                    x.FechaCreacion,
                    x.FechaModificacion,
                    Materiales = x.InvMaterialesReceta
                        .OrderBy(m => m.IdMateriaPrimaNavigation.NombreMaterial)
                        .Select(m => new
                        {
                            m.IdMateriaPrima,
                            NombreMaterial = m.IdMateriaPrimaNavigation.NombreMaterial,
                            m.IdMateriaPrimaNavigation.EsCafeCalibrable,
                            m.IdMateriaPrimaNavigation.NoDescuentaInventario,
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

        /// <summary>
        /// Productos marcados con receta pero que aún no tienen una receta activa configurada.
        /// Alimenta el botón "Crear Receta" de la vista de recetas.
        /// </summary>
        [HttpGet("products-without-recipe")]
        [Permission(Permissions.RecipesEdit)]
        public async Task<IActionResult> GetProductsWithoutRecipe()
        {
            var products = await _context.InvProductos.AsNoTracking()
                .Where(p => p.Activo && p.RequiereReceta == true && !p.InvRecetas.Any(r => r.Estado))
                .OrderBy(p => p.NombreProducto)
                .Select(p => new { p.IdProducto, p.NombreProducto })
                .ToListAsync();
            return Ok(products);
        }

        [HttpGet("product/{idProducto:int}")]
        [Permission(Permissions.RecipesView + "|" + Permissions.SalesComandasManage)]
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
                        NombreMaterial = m.IdMateriaPrimaNavigation.NombreMaterial,
                        m.IdMateriaPrimaNavigation.EsCafeCalibrable,
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

            var existingRecipe = await _context.InvRecetas
                .Include(x => x.InvMaterialesReceta)
                .FirstOrDefaultAsync(x => x.IdProducto == idProducto && x.Estado);

            var (materials, materialsError) = await BuildValidatedMaterialsAsync(dto.Materiales);
            if (materialsError != null) return BadRequest(new { mensaje = materialsError });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            InvRecetas recipe;
            if (existingRecipe == null)
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
                recipe = existingRecipe;
                _context.InvMaterialesReceta.RemoveRange(recipe.InvMaterialesReceta);
                recipe.FechaModificacion = DateTime.Now;
            }

            _context.InvMaterialesReceta.AddRange(MapMaterials(recipe.IdReceta, materials!));
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Receta guardada correctamente.", recipe.IdReceta });
        }

        // ---- Helpers ---------------------------------------------------------

        private static IEnumerable<InvMaterialesReceta> MapMaterials(int idReceta, List<RecipeMaterialDto> materials) =>
            materials.Select(material => new InvMaterialesReceta
            {
                IdReceta = idReceta,
                IdMateriaPrima = material.IdMateriaPrima,
                IdUnidadMedida = material.IdUnidadMedida,
                CantidadRequerida = material.CantidadRequerida,
                IdMateriaPrimaReemplazada = material.IdMateriaPrimaReemplazada,
                Recargo = material.IdMateriaPrimaReemplazada.HasValue ? material.Recargo : 0,
                UsaMismaMedidaQuePrincipal = material.IdMateriaPrimaReemplazada.HasValue && material.UsaMismaMedidaQuePrincipal
            });

        /// <summary>
        /// Valida y normaliza la lista de materiales de una receta (dedupe, alternativas, unidades,
        /// café calibrable). Devuelve los materiales listos para persistir o un mensaje de error.
        /// </summary>
        private async Task<(List<RecipeMaterialDto>? Materials, string? Error)> BuildValidatedMaterialsAsync(List<RecipeMaterialDto> input)
        {
            var materials = input
                .GroupBy(x => x.IdMateriaPrima)
                .Select(x => x.First())
                .ToList();
            if (materials.Count == 0) return (null, "Debe seleccionar al menos una materia prima.");
            if (materials.Any(x => x.Recargo < 0))
                return (null, "El recargo de una materia prima no puede ser negativo.");

            var ids = materials.Select(x => x.IdMateriaPrima).ToList();
            var rawMaterials = await _context.InvMateriaPrima.AsNoTracking()
                .Include(x => x.IdUnidadMedidaNavigation)
                .Where(x => ids.Contains(x.IdMateriaPrima))
                .ToDictionaryAsync(x => x.IdMateriaPrima);
            if (rawMaterials.Count != ids.Count)
                return (null, "Una o más materias primas no son válidas.");

            var selectedIds = ids.ToHashSet();
            foreach (var alternative in materials.Where(x => x.IdMateriaPrimaReemplazada.HasValue))
            {
                if (alternative.IdMateriaPrimaReemplazada == alternative.IdMateriaPrima)
                    return (null, "Una materia prima no puede ser alternativa de sí misma.");
                if (!selectedIds.Contains(alternative.IdMateriaPrimaReemplazada!.Value))
                    return (null, "La materia prima principal de cada alternativa debe formar parte de la receta.");

                var baseMaterial = materials.First(x => x.IdMateriaPrima == alternative.IdMateriaPrimaReemplazada.Value);
                if (baseMaterial.IdMateriaPrimaReemplazada.HasValue)
                    return (null, "No se permiten cadenas de alternativas. La materia principal no puede reemplazar a otra.");

                if (alternative.UsaMismaMedidaQuePrincipal)
                {
                    alternative.CantidadRequerida = baseMaterial.CantidadRequerida;
                    alternative.IdUnidadMedida = baseMaterial.IdUnidadMedida;
                }

                // Recargo por opción: si la materia tiene un recargo base no modificable, se fija
                // a ese valor (0 si no tiene). Si es modificable, se respeta el valor recibido.
                var altMateria = rawMaterials[alternative.IdMateriaPrima];
                if (!altMateria.RecargoModificable)
                    alternative.Recargo = altMateria.RecargoBase;
            }

            // Las materias que no se descuentan (p. ej. agua) llevan cantidad solo de referencia:
            // se permite 0 o vacío. El resto sí debe indicar una cantidad mayor que cero.
            if (materials.Any(x => x.CantidadRequerida <= 0 && !rawMaterials[x.IdMateriaPrima].NoDescuentaInventario))
                return (null, "La cantidad requerida de cada materia prima debe ser mayor que cero.");

            var unitIds = materials.Select(x => x.IdUnidadMedida).Distinct().ToList();
            var units = await _context.InvUnidadesMedida.AsNoTracking()
                .Where(x => unitIds.Contains(x.IdUnidadMedida))
                .ToDictionaryAsync(x => x.IdUnidadMedida);
            if (units.Count != unitIds.Count)
                return (null, "Una o más unidades de medida no son válidas.");

            foreach (var material in materials)
            {
                var recipeUnit = units[material.IdUnidadMedida];
                var stockUnit = rawMaterials[material.IdMateriaPrima].IdUnidadMedidaNavigation;
                if (recipeUnit.TipoMagnitud != stockUnit.TipoMagnitud)
                    return (null, $"La unidad {recipeUnit.Abreviacion} no es compatible con {rawMaterials[material.IdMateriaPrima].NombreMaterial}.");
                if (!rawMaterials[material.IdMateriaPrima].NoDescuentaInventario
                    && recipeUnit.TipoMagnitud == "Unidad" && decimal.Truncate(material.CantidadRequerida) != material.CantidadRequerida)
                    return (null, $"La cantidad de {rawMaterials[material.IdMateriaPrima].NombreMaterial} debe ser un número entero.");
            }

            // El café calibrable toma sus gramos de la última extracción del turno, así que en la
            // receta debe expresarse en gramos (g) y no puede heredar la medida de otra materia.
            foreach (var material in materials.Where(x => rawMaterials[x.IdMateriaPrima].EsCafeCalibrable))
            {
                if (units[material.IdUnidadMedida].Abreviacion.Trim().ToLowerInvariant() != "g")
                    return (null, $"{rawMaterials[material.IdMateriaPrima].NombreMaterial} es café calibrable: debe configurarse en gramos (g).");
                if (material.UsaMismaMedidaQuePrincipal)
                    return (null, $"{rawMaterials[material.IdMateriaPrima].NombreMaterial} es café calibrable y debe expresarse en gramos, no heredar la medida de otra materia.");
            }

            return (materials, null);
        }
    }
}
