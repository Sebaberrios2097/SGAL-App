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
                .OrderBy(x => x.IdProducto != null ? x.IdProductoNavigation!.NombreProducto : x.Nombre)
                .Select(x => new
                {
                    x.IdReceta,
                    x.IdProducto,
                    Nombre = x.IdProducto != null ? x.IdProductoNavigation!.NombreProducto : x.Nombre,
                    x.EsPreparacionBase,
                    x.IdRecetaBase,
                    NombreBase = x.IdRecetaBaseNavigation != null ? x.IdRecetaBaseNavigation.Nombre : null,
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
                    x.IdRecetaBase,
                    NombreBase = x.IdRecetaBaseNavigation != null ? x.IdRecetaBaseNavigation.Nombre : null,
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

            var baseError = await ValidateBaseRecipeAsync(dto.IdRecetaBase, existingRecipe?.IdReceta);
            if (baseError != null) return BadRequest(new { mensaje = baseError });

            var (materials, materialsError) = await BuildValidatedMaterialsAsync(dto.Materiales);
            if (materialsError != null) return BadRequest(new { mensaje = materialsError });

            await using var transaction = await _context.Database.BeginTransactionAsync();

            InvRecetas recipe;
            if (existingRecipe == null)
            {
                recipe = new InvRecetas
                {
                    IdProducto = idProducto,
                    EsPreparacionBase = false,
                    IdRecetaBase = dto.IdRecetaBase,
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
                recipe.IdRecetaBase = dto.IdRecetaBase;
                recipe.FechaModificacion = DateTime.Now;
            }

            _context.InvMaterialesReceta.AddRange(MapMaterials(recipe.IdReceta, materials!));
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Receta guardada correctamente.", recipe.IdReceta });
        }

        // ---- Preparaciones base independientes (recetas sin producto) --------

        [HttpGet("base")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetBasePreparations()
        {
            var bases = await _context.InvRecetas.AsNoTracking()
                .Where(x => x.EsPreparacionBase)
                .OrderBy(x => x.Nombre)
                .Select(x => new
                {
                    x.IdReceta,
                    x.Nombre,
                    x.IdRecetaBase,
                    NombreBase = x.IdRecetaBaseNavigation != null ? x.IdRecetaBaseNavigation.Nombre : null,
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
                }).ToListAsync();
            return Ok(bases);
        }

        [HttpGet("base/{idReceta:int}")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetBasePreparation(int idReceta)
        {
            var preparation = await _context.InvRecetas.AsNoTracking()
                .Where(x => x.IdReceta == idReceta && x.EsPreparacionBase)
                .Select(x => new
                {
                    x.IdReceta,
                    x.Nombre,
                    x.IdRecetaBase,
                    NombreBase = x.IdRecetaBaseNavigation != null ? x.IdRecetaBaseNavigation.Nombre : null,
                    x.Estado,
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

            return preparation == null
                ? NotFound(new { mensaje = "Preparación base no encontrada." })
                : Ok(preparation);
        }

        [HttpPost("base")]
        [Permission(Permissions.RecipesEdit)]
        public async Task<IActionResult> CreateBasePreparation([FromBody] BasePreparationDto dto)
        {
            var nombre = dto.Nombre?.Trim();
            if (string.IsNullOrWhiteSpace(nombre))
                return BadRequest(new { mensaje = "El nombre de la preparación base es obligatorio." });
            if (nombre.Length > 100)
                return BadRequest(new { mensaje = "El nombre no puede superar los 100 caracteres." });
            if (await _context.InvRecetas.AnyAsync(x => x.EsPreparacionBase && x.Nombre == nombre))
                return BadRequest(new { mensaje = "Ya existe una preparación base con ese nombre." });

            var baseError = await ValidateBaseRecipeAsync(dto.IdRecetaBase, null);
            if (baseError != null) return BadRequest(new { mensaje = baseError });

            var (materials, materialsError) = await BuildValidatedMaterialsAsync(dto.Materiales);
            if (materialsError != null) return BadRequest(new { mensaje = materialsError });

            await using var transaction = await _context.Database.BeginTransactionAsync();
            var recipe = new InvRecetas
            {
                IdProducto = null,
                Nombre = nombre,
                EsPreparacionBase = true,
                IdRecetaBase = dto.IdRecetaBase,
                Estado = true,
                FechaCreacion = DateTime.Now
            };
            _context.InvRecetas.Add(recipe);
            await _context.SaveChangesAsync();

            _context.InvMaterialesReceta.AddRange(MapMaterials(recipe.IdReceta, materials!));
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Preparación base creada correctamente.", recipe.IdReceta });
        }

        [HttpPut("base/{idReceta:int}")]
        [Permission(Permissions.RecipesEdit)]
        public async Task<IActionResult> UpdateBasePreparation(int idReceta, [FromBody] BasePreparationDto dto)
        {
            var recipe = await _context.InvRecetas
                .Include(x => x.InvMaterialesReceta)
                .FirstOrDefaultAsync(x => x.IdReceta == idReceta && x.EsPreparacionBase);
            if (recipe == null) return NotFound(new { mensaje = "Preparación base no encontrada." });

            var nombre = dto.Nombre?.Trim();
            if (string.IsNullOrWhiteSpace(nombre))
                return BadRequest(new { mensaje = "El nombre de la preparación base es obligatorio." });
            if (nombre.Length > 100)
                return BadRequest(new { mensaje = "El nombre no puede superar los 100 caracteres." });
            if (await _context.InvRecetas.AnyAsync(x => x.EsPreparacionBase && x.Nombre == nombre && x.IdReceta != idReceta))
                return BadRequest(new { mensaje = "Ya existe otra preparación base con ese nombre." });

            var baseError = await ValidateBaseRecipeAsync(dto.IdRecetaBase, idReceta);
            if (baseError != null) return BadRequest(new { mensaje = baseError });

            var (materials, materialsError) = await BuildValidatedMaterialsAsync(dto.Materiales);
            if (materialsError != null) return BadRequest(new { mensaje = materialsError });

            await using var transaction = await _context.Database.BeginTransactionAsync();
            _context.InvMaterialesReceta.RemoveRange(recipe.InvMaterialesReceta);
            recipe.Nombre = nombre;
            recipe.IdRecetaBase = dto.IdRecetaBase;
            recipe.FechaModificacion = DateTime.Now;
            _context.InvMaterialesReceta.AddRange(MapMaterials(recipe.IdReceta, materials!));
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { mensaje = "Preparación base actualizada correctamente.", recipe.IdReceta });
        }

        [HttpDelete("base/{idReceta:int}")]
        [Permission(Permissions.RecipesEdit)]
        public async Task<IActionResult> DeleteBasePreparation(int idReceta)
        {
            var recipe = await _context.InvRecetas
                .Include(x => x.InvMaterialesReceta)
                .FirstOrDefaultAsync(x => x.IdReceta == idReceta && x.EsPreparacionBase);
            if (recipe == null) return NotFound(new { mensaje = "Preparación base no encontrada." });

            // Impide borrar una base en uso por otras recetas.
            if (await _context.InvRecetas.AnyAsync(x => x.IdRecetaBase == idReceta))
                return BadRequest(new { mensaje = "No se puede eliminar: otras recetas la usan como base." });

            _context.InvMaterialesReceta.RemoveRange(recipe.InvMaterialesReceta);
            _context.InvRecetas.Remove(recipe);
            await _context.SaveChangesAsync();
            return Ok(new { mensaje = "Preparación base eliminada correctamente." });
        }

        /// <summary>
        /// Preparaciones base que pueden usarse como base de una receta: preparaciones base activas,
        /// excluyendo (si se indica <paramref name="excludeRecipe"/>) la propia receta y aquellas cuya
        /// cadena de bases la incluye (para no generar dependencias circulares).
        /// </summary>
        [HttpGet("base-candidates")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetBaseCandidates([FromQuery] int? excludeRecipe = null)
        {
            var bases = await _context.InvRecetas.AsNoTracking()
                .Where(r => r.EsPreparacionBase && r.Estado)
                .Select(r => new { r.IdReceta, r.Nombre, r.IdRecetaBase })
                .ToListAsync();
            var baseDe = bases.ToDictionary(r => r.IdReceta, r => r.IdRecetaBase);

            // ¿El candidato tiene a excludeRecipe en su cadena de bases? Entonces sería un ciclo.
            bool GeneraCiclo(int candidato)
            {
                if (excludeRecipe == null) return false;
                int? cursor = candidato;
                var visitados = new HashSet<int>();
                while (cursor.HasValue)
                {
                    if (cursor.Value == excludeRecipe.Value) return true;
                    if (!visitados.Add(cursor.Value)) break;
                    cursor = baseDe.TryGetValue(cursor.Value, out var next) ? next : null;
                }
                return false;
            }

            var candidatos = bases
                .Where(r => r.IdReceta != excludeRecipe && !GeneraCiclo(r.IdReceta))
                .OrderBy(r => r.Nombre, StringComparer.Create(new System.Globalization.CultureInfo("es"), true))
                .Select(r => new { r.IdReceta, r.Nombre })
                .ToList();
            return Ok(candidatos);
        }

        /// <summary>
        /// Materiales heredados de una preparación base (recorriendo su cadena de bases), aplanados y
        /// con nombres, para mostrarlos como bloque de solo lectura en el editor de recetas.
        /// </summary>
        [HttpGet("composed/{idRecetaBase:int}")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetComposedMaterials(int idRecetaBase)
        {
            var materiales = new List<object>();
            var visitados = new HashSet<int>();
            int? actual = idRecetaBase;
            while (actual.HasValue)
            {
                if (!visitados.Add(actual.Value)) break;
                var receta = await _context.InvRecetas.AsNoTracking()
                    .Where(r => r.IdReceta == actual.Value && r.Estado)
                    .Select(r => new
                    {
                        r.IdRecetaBase,
                        NombrePreparacion = r.IdProducto != null ? r.IdProductoNavigation!.NombreProducto : r.Nombre,
                        Materiales = r.InvMaterialesReceta.Select(m => new
                        {
                            m.IdMateriaPrima,
                            NombreMaterial = m.IdMateriaPrimaNavigation.NombreMaterial,
                            m.IdMateriaPrimaNavigation.EsCafeCalibrable,
                            m.CantidadRequerida,
                            AbreviacionUnidad = m.IdUnidadMedidaNavigation.Abreviacion,
                            m.IdMateriaPrimaReemplazada,
                            NombreMateriaPrimaReemplazada = m.IdMateriaPrimaReemplazadaNavigation != null
                                ? m.IdMateriaPrimaReemplazadaNavigation.NombreMaterial
                                : null,
                            m.Recargo
                        }).ToList()
                    }).FirstOrDefaultAsync();
                if (receta == null) break;

                foreach (var m in receta.Materiales)
                    materiales.Add(new
                    {
                        receta.NombrePreparacion,
                        m.IdMateriaPrima,
                        m.NombreMaterial,
                        m.EsCafeCalibrable,
                        m.CantidadRequerida,
                        m.AbreviacionUnidad,
                        m.IdMateriaPrimaReemplazada,
                        m.NombreMateriaPrimaReemplazada,
                        m.Recargo
                    });
                actual = receta.IdRecetaBase;
            }
            return Ok(materiales);
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
        /// Valida que la preparación base indicada sea una base activa y que no genere ciclos con la
        /// receta que se está editando (<paramref name="currentRecipeId"/>, null si es nueva).
        /// </summary>
        private async Task<string?> ValidateBaseRecipeAsync(int? idRecetaBase, int? currentRecipeId)
        {
            if (!idRecetaBase.HasValue) return null;
            if (currentRecipeId.HasValue && idRecetaBase.Value == currentRecipeId.Value)
                return "Una preparación no puede usarse como su propia base.";

            var baseRecipe = await _context.InvRecetas.AsNoTracking()
                .FirstOrDefaultAsync(r => r.IdReceta == idRecetaBase.Value);
            if (baseRecipe == null || !baseRecipe.EsPreparacionBase)
                return "La preparación base seleccionada no es válida.";
            if (!baseRecipe.Estado)
                return "La preparación base seleccionada está inactiva.";

            // Detección de ciclos sobre el grafo de bases.
            var cadena = await _context.InvRecetas.AsNoTracking()
                .Where(r => r.IdRecetaBase != null)
                .Select(r => new { r.IdReceta, r.IdRecetaBase })
                .ToDictionaryAsync(r => r.IdReceta, r => r.IdRecetaBase);
            int? cursor = idRecetaBase.Value;
            var visitados = new HashSet<int>();
            while (cursor.HasValue)
            {
                if (currentRecipeId.HasValue && cursor.Value == currentRecipeId.Value)
                    return "La preparación base genera una dependencia circular.";
                if (!visitados.Add(cursor.Value)) break;
                cursor = cadena.TryGetValue(cursor.Value, out var next) ? next : null;
            }
            return null;
        }

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
