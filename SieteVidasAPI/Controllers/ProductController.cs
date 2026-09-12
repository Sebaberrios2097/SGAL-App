using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public ProductController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.ProductsView + "|" + Permissions.SalesOperate + "|" + Permissions.SalesCreate + "|" + Permissions.LogbookConsumptionsCreate)]
        public async Task<IActionResult> GetProducts()
        {
            // Recetas activas con sus materiales (incluida la materia base de cada alternativa y si
            // es café calibrable). Se cargan una vez para componer, en memoria, la receta de cada
            // producto con la de su preparación base recorriendo la cadena de bases.
            var recetas = await _context.InvRecetas.AsNoTracking()
                .Where(r => r.Estado)
                .Select(r => new
                {
                    r.IdReceta,
                    r.IdProducto,
                    r.IdRecetaBase,
                    Materiales = r.InvMaterialesReceta.Select(m => new
                    {
                        m.IdMateriaPrima,
                        NombreMateriaPrima = m.IdMateriaPrimaNavigation.NombreMaterial,
                        m.IdMateriaPrimaNavigation.EsCafeCalibrable,
                        m.IdMateriaPrimaReemplazada,
                        NombreMateriaPrimaReemplazada = m.IdMateriaPrimaReemplazadaNavigation != null
                            ? m.IdMateriaPrimaReemplazadaNavigation.NombreMaterial
                            : null,
                        m.Recargo
                    }).ToList()
                })
                .ToListAsync();
            var recetaPorId = recetas.ToDictionary(r => r.IdReceta);
            var recetaRaizPorProducto = recetas
                .Where(r => r.IdProducto != null)
                .ToDictionary(r => r.IdProducto!.Value, r => r.IdReceta);

            var products = await _context.InvProductos
                .Include(p => p.IdCategoriaProductoNavigation)
                .OrderByDescending(p => p.FechaIngreso)
                .Select(p => new
                {
                    p.IdProducto,
                    p.IdCategoriaProducto,
                    p.CodigoProducto,
                    NombreCategoriaProducto = p.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                    p.NombreProducto,
                    p.DescripcionProducto,
                    p.Precio,
                    p.Stock,
                    RequiereReceta = p.RequiereReceta ?? false,
                    p.AceptaIngredientesExtra,
                    TieneRecetaConfigurada = p.InvRecetas.Any(r => r.Estado),
                    p.FechaIngreso,
                    p.Activo,
                    p.FechaModificacion,
                    ImagenBase64 = p.Imagen != null ? Convert.ToBase64String(p.Imagen) : null
                })
                .ToListAsync();

            var result = products.Select(p =>
            {
                var alternativas = new List<object>();
                bool requiereCalibracion = false;

                if (p.RequiereReceta && recetaRaizPorProducto.TryGetValue(p.IdProducto, out var idRecetaRaiz))
                {
                    int? actual = idRecetaRaiz;
                    var visitados = new HashSet<int>();
                    while (actual.HasValue && visitados.Add(actual.Value)
                        && recetaPorId.TryGetValue(actual.Value, out var receta))
                    {
                        foreach (var m in receta.Materiales)
                        {
                            if (m.EsCafeCalibrable) requiereCalibracion = true;
                            if (m.IdMateriaPrimaReemplazada.HasValue)
                                alternativas.Add(new
                                {
                                    IdMateriaPrimaBase = m.IdMateriaPrimaReemplazada.Value,
                                    NombreMateriaPrimaBase = m.NombreMateriaPrimaReemplazada,
                                    IdMateriaPrimaAlternativa = m.IdMateriaPrima,
                                    NombreMateriaPrimaAlternativa = m.NombreMateriaPrima,
                                    m.Recargo
                                });
                        }
                        actual = receta.IdRecetaBase;
                    }
                }

                return new
                {
                    p.IdProducto,
                    p.IdCategoriaProducto,
                    p.CodigoProducto,
                    p.NombreCategoriaProducto,
                    p.NombreProducto,
                    p.DescripcionProducto,
                    p.Precio,
                    p.Stock,
                    p.RequiereReceta,
                    p.AceptaIngredientesExtra,
                    p.TieneRecetaConfigurada,
                    AlternativasReceta = alternativas,
                    RequiereCalibracion = requiereCalibracion,
                    p.FechaIngreso,
                    p.Activo,
                    p.FechaModificacion,
                    p.ImagenBase64
                };
            }).ToList();

            return Ok(result);
        }

        [HttpPost]
        [Permission(Permissions.ProductsCreate)]
        public async Task<IActionResult> CreateProduct([FromBody] ProductDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto) || string.IsNullOrWhiteSpace(dto.CodigoProducto))
            {
                return BadRequest(new { Mensaje = "El código y el nombre del producto son obligatorios" });
            }

            var productCode = dto.CodigoProducto.Trim().ToUpperInvariant();
            if (productCode.Length > 50)
                return BadRequest(new { Mensaje = "El código del producto no puede superar los 50 caracteres" });

            var category = await _context.InvCategoriaProductos.FindAsync(dto.IdCategoriaProducto);
            if (category == null)
            {
                return BadRequest(new { Mensaje = "Categoría de producto no válida" });
            }

            var existing = await _context.InvProductos
                .FirstOrDefaultAsync(p => p.NombreProducto.ToLower() == dto.NombreProducto.ToLower());

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "El producto ya existe" });
            }

            if (await _context.InvProductos.AnyAsync(p => p.CodigoProducto == productCode))
                return BadRequest(new { Mensaje = "Ya existe un producto con ese código" });

            byte[]? imageBytes = null;
            if (!string.IsNullOrWhiteSpace(dto.ImagenBase64))
            {
                try
                {
                    var base64Data = dto.ImagenBase64;
                    if (base64Data.Contains(","))
                    {
                        base64Data = base64Data.Substring(base64Data.IndexOf(",") + 1);
                    }
                    imageBytes = Convert.FromBase64String(base64Data);
                }
                catch { }
            }

            var product = new InvProductos
            {
                IdCategoriaProducto = dto.IdCategoriaProducto,
                CodigoProducto = productCode,
                NombreProducto = dto.NombreProducto,
                DescripcionProducto = dto.DescripcionProducto,
                Precio = dto.Precio,
                Stock = dto.RequiereReceta ? null : dto.Stock,
                RequiereReceta = dto.RequiereReceta,
                AceptaIngredientesExtra = dto.AceptaIngredientesExtra,
                FechaIngreso = DateTime.Now,
                Activo = true,
                Imagen = imageBytes
            };

            _context.InvProductos.Add(product);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                product.IdProducto,
                product.IdCategoriaProducto,
                product.CodigoProducto,
                NombreCategoriaProducto = category.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                RequiereReceta = product.RequiereReceta ?? false,
                product.AceptaIngredientesExtra,
                TieneRecetaConfigurada = false,
                product.FechaIngreso,
                product.Activo,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }

        [HttpPut("{id}")]
        [Permission(Permissions.ProductsEdit)]
        public async Task<IActionResult> UpdateProduct(int id, [FromBody] ProductDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto) || string.IsNullOrWhiteSpace(dto.CodigoProducto))
            {
                return BadRequest(new { Mensaje = "El código y el nombre del producto son obligatorios" });
            }

            var productCode = dto.CodigoProducto.Trim().ToUpperInvariant();
            if (productCode.Length > 50)
                return BadRequest(new { Mensaje = "El código del producto no puede superar los 50 caracteres" });

            var product = await _context.InvProductos.FindAsync(id);
            if (product == null)
            {
                return NotFound(new { Mensaje = "Producto no encontrado" });
            }

            var category = await _context.InvCategoriaProductos.FindAsync(dto.IdCategoriaProducto);
            if (category == null)
            {
                return BadRequest(new { Mensaje = "Categoría de producto no válida" });
            }

            var existing = await _context.InvProductos
                .FirstOrDefaultAsync(p => p.NombreProducto.ToLower() == dto.NombreProducto.ToLower() && p.IdProducto != id);

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "Ya existe otro producto con ese nombre" });
            }

            if (await _context.InvProductos.AnyAsync(p => p.CodigoProducto == productCode && p.IdProducto != id))
                return BadRequest(new { Mensaje = "Ya existe otro producto con ese código" });

            if (dto.ImagenBase64 == "")
            {
                product.Imagen = null;
            }
            else if (dto.ImagenBase64 != null)
            {
                try
                {
                    var base64Data = dto.ImagenBase64;
                    if (base64Data.Contains(","))
                    {
                        base64Data = base64Data.Substring(base64Data.IndexOf(",") + 1);
                    }
                    product.Imagen = Convert.FromBase64String(base64Data);
                }
                catch { }
            }

            product.IdCategoriaProducto = dto.IdCategoriaProducto;
            product.CodigoProducto = productCode;
            product.NombreProducto = dto.NombreProducto;
            product.DescripcionProducto = dto.DescripcionProducto;
            product.Precio = dto.Precio;
            product.Stock = dto.RequiereReceta ? null : dto.Stock;
            product.RequiereReceta = dto.RequiereReceta;
            product.AceptaIngredientesExtra = dto.AceptaIngredientesExtra;
            product.FechaModificacion = DateTime.Now;

            if (!dto.RequiereReceta)
            {
                var activeRecipes = await _context.InvRecetas
                    .Where(r => r.IdProducto == id && r.Estado)
                    .ToListAsync();
                activeRecipes.ForEach(r =>
                {
                    r.Estado = false;
                    r.FechaModificacion = DateTime.Now;
                });
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                product.IdProducto,
                product.IdCategoriaProducto,
                product.CodigoProducto,
                NombreCategoriaProducto = category.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                RequiereReceta = product.RequiereReceta ?? false,
                product.AceptaIngredientesExtra,
                TieneRecetaConfigurada = await _context.InvRecetas.AnyAsync(r => r.IdProducto == id && r.Estado),
                product.FechaIngreso,
                product.Activo,
                product.FechaModificacion,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }

        [HttpPut("{id}/status")]
        [Permission(Permissions.ProductsStatusEdit)]
        public async Task<IActionResult> ToggleStatus(int id)
        {
            var product = await _context.InvProductos
                .Include(p => p.IdCategoriaProductoNavigation)
                .FirstOrDefaultAsync(p => p.IdProducto == id);

            if (product == null)
            {
                return NotFound(new { Mensaje = "Producto no encontrado" });
            }

            product.Activo = !product.Activo;
            product.FechaModificacion = DateTime.Now;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                product.IdProducto,
                product.IdCategoriaProducto,
                product.CodigoProducto,
                NombreCategoriaProducto = product.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                RequiereReceta = product.RequiereReceta ?? false,
                TieneRecetaConfigurada = await _context.InvRecetas.AnyAsync(r => r.IdProducto == id && r.Estado),
                product.FechaIngreso,
                product.Activo,
                product.FechaModificacion,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }
    }
}
