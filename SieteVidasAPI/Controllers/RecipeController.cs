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
                    x.IdProductoBase,
                    NombreProductoBase = x.IdProductoBaseNavigation != null ? x.IdProductoBaseNavigation.NombreProducto : null,
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
                    x.IdProductoBase,
                    NombreProductoBase = x.IdProductoBaseNavigation != null ? x.IdProductoBaseNavigation.NombreProducto : null,
                    x.FechaCreacion,
                    x.FechaModificacion,
                    Materiales = x.InvMaterialesReceta.Select(m => new
                    {
                        m.IdMateriaPrima,
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

            // Preparación base opcional: debe ser otro producto con receta activa y no formar ciclos.
            if (dto.IdProductoBase.HasValue)
            {
                if (dto.IdProductoBase.Value == idProducto)
                    return BadRequest(new { mensaje = "Una preparación no puede usarse como su propia base." });

                var baseProduct = await _context.InvProductos.AsNoTracking()
                    .FirstOrDefaultAsync(p => p.IdProducto == dto.IdProductoBase.Value);
                if (baseProduct == null || baseProduct.RequiereReceta != true)
                    return BadRequest(new { mensaje = "La preparación base no es válida." });
                if (!await _context.InvRecetas.AnyAsync(r => r.IdProducto == dto.IdProductoBase.Value && r.Estado))
                    return BadRequest(new { mensaje = "La preparación base debe tener una receta activa." });

                // Detección de ciclos: se recorre la cadena de bases del candidato.
                var cadenaBases = await _context.InvRecetas.AsNoTracking()
                    .Where(r => r.Estado && r.IdProductoBase != null)
                    .Select(r => new { r.IdProducto, r.IdProductoBase })
                    .ToDictionaryAsync(r => r.IdProducto, r => r.IdProductoBase);
                int? cursor = dto.IdProductoBase.Value;
                var visitados = new HashSet<int>();
                while (cursor.HasValue)
                {
                    if (cursor.Value == idProducto)
                        return BadRequest(new { mensaje = "La preparación base genera una dependencia circular." });
                    if (!visitados.Add(cursor.Value)) break;
                    cursor = cadenaBases.TryGetValue(cursor.Value, out var next) ? next : null;
                }
            }

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

            // El café calibrable toma sus gramos de la última extracción del turno, así que en la
            // receta debe expresarse en gramos (g) y no puede heredar la medida de otra materia.
            foreach (var material in materials.Where(x => rawMaterials[x.IdMateriaPrima].EsCafeCalibrable))
            {
                if (units[material.IdUnidadMedida].Abreviacion.Trim().ToLowerInvariant() != "g")
                    return BadRequest(new { mensaje = $"{rawMaterials[material.IdMateriaPrima].NombreMaterial} es café calibrable: debe configurarse en gramos (g)." });
                if (material.UsaMismaMedidaQuePrincipal)
                    return BadRequest(new { mensaje = $"{rawMaterials[material.IdMateriaPrima].NombreMaterial} es café calibrable y debe expresarse en gramos, no heredar la medida de otra materia." });
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
                    IdProductoBase = dto.IdProductoBase,
                    Estado = true,
                    FechaCreacion = DateTime.Now
                };
                _context.InvRecetas.Add(recipe);
                await _context.SaveChangesAsync();
            }
            else
            {
                _context.InvMaterialesReceta.RemoveRange(recipe.InvMaterialesReceta);
                recipe.IdProductoBase = dto.IdProductoBase;
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

        /// <summary>
        /// Preparaciones que pueden usarse como base de la receta de <paramref name="idProducto"/>:
        /// productos con receta activa, excluyendo el propio producto y sus descendientes (para no
        /// generar dependencias circulares).
        /// </summary>
        [HttpGet("base-candidates/{idProducto:int}")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetBaseCandidates(int idProducto)
        {
            var recetasActivas = await _context.InvRecetas.AsNoTracking()
                .Where(r => r.Estado)
                .Select(r => new { r.IdProducto, r.IdProductoBase, Nombre = r.IdProductoNavigation.NombreProducto })
                .ToListAsync();
            var baseDe = recetasActivas.ToDictionary(r => r.IdProducto, r => r.IdProductoBase);

            // ¿El candidato tiene a idProducto en su cadena de bases? Entonces elegirlo sería un ciclo.
            bool GeneraCiclo(int candidato)
            {
                int? cursor = candidato;
                var visitados = new HashSet<int>();
                while (cursor.HasValue)
                {
                    if (cursor.Value == idProducto) return true;
                    if (!visitados.Add(cursor.Value)) break;
                    cursor = baseDe.TryGetValue(cursor.Value, out var next) ? next : null;
                }
                return false;
            }

            var candidatos = recetasActivas
                .Where(r => r.IdProducto != idProducto && !GeneraCiclo(r.IdProducto))
                .OrderBy(r => r.Nombre, StringComparer.Create(new System.Globalization.CultureInfo("es"), true))
                .Select(r => new { r.IdProducto, NombreProducto = r.Nombre })
                .ToList();
            return Ok(candidatos);
        }

        /// <summary>
        /// Materiales heredados de una preparación (recorriendo su cadena de bases), aplanados y
        /// con nombres, para mostrarlos como bloque de solo lectura en el editor de recetas.
        /// </summary>
        [HttpGet("composed/{idProducto:int}")]
        [Permission(Permissions.RecipesView)]
        public async Task<IActionResult> GetComposedMaterials(int idProducto)
        {
            var materiales = new List<object>();
            var visitados = new HashSet<int>();
            int? actual = idProducto;
            while (actual.HasValue)
            {
                if (!visitados.Add(actual.Value)) break;
                var receta = await _context.InvRecetas.AsNoTracking()
                    .Where(r => r.IdProducto == actual.Value && r.Estado)
                    .Select(r => new
                    {
                        r.IdProductoBase,
                        NombrePreparacion = r.IdProductoNavigation.NombreProducto,
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
                actual = receta.IdProductoBase;
            }
            return Ok(materiales);
        }
    }
}
