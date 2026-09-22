using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductController : ControllerBase
    {
        private readonly SgalContext _context;

        public ProductController(SgalContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.ProductsView + "|" + Permissions.SalesOperate + "|" + Permissions.SalesCreate + "|" + Permissions.LogbookConsumptionsCreate + "|" + Permissions.CajaCollect)]
        public async Task<IActionResult> GetProducts()
        {
            var calibrationEnabled = await _context.OrgConfiguracion.AsNoTracking()
                .Where(configuration => configuration.IdConfiguracion == 1)
                .Select(configuration => (bool?)configuration.BitacoraIncluyeCalibracion)
                .FirstOrDefaultAsync() ?? true;
            // Receta activa de cada producto con sus materiales (materia base de cada alternativa y
            // si es café calibrable). Cada producto con receta tiene la suya propia e independiente.
            var recetas = await _context.InvRecetas.AsNoTracking()
                .Where(r => r.Estado)
                .Select(r => new
                {
                    r.IdProducto,
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
            var recetaPorProducto = recetas.ToDictionary(r => r.IdProducto);

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
                    p.EsPack,
                    p.IdProductoBase,
                    p.CantidadPack,
                    NombreProductoBase = p.IdProductoBaseNavigation != null ? p.IdProductoBaseNavigation.NombreProducto : null,
                    StockBase = p.IdProductoBaseNavigation != null ? p.IdProductoBaseNavigation.Stock : null,
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

                if (p.RequiereReceta && recetaPorProducto.TryGetValue(p.IdProducto, out var receta))
                {
                    foreach (var m in receta.Materiales)
                    {
                        if (calibrationEnabled && m.EsCafeCalibrable) requiereCalibracion = true;
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
                }

                // El pack no tiene stock propio: su disponibilidad se deriva del producto base.
                int? stockMostrado = p.EsPack
                    ? (p.CantidadPack.HasValue && p.CantidadPack.Value > 0 && p.StockBase.HasValue
                        ? p.StockBase.Value / p.CantidadPack.Value
                        : 0)
                    : p.Stock;

                return new
                {
                    p.IdProducto,
                    p.IdCategoriaProducto,
                    p.CodigoProducto,
                    p.NombreCategoriaProducto,
                    p.NombreProducto,
                    p.DescripcionProducto,
                    p.Precio,
                    Stock = stockMostrado,
                    p.EsPack,
                    p.IdProductoBase,
                    p.NombreProductoBase,
                    p.CantidadPack,
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
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto))
            {
                return BadRequest(new { Mensaje = "El nombre del producto es obligatorio" });
            }
            var materialsEnabled = await IsMaterialsModuleEnabledAsync();
            if ((dto.RequiereReceta || dto.AceptaIngredientesExtra) && !materialsEnabled)
                return BadRequest(new { Mensaje = "Habilite el módulo Recetas y materiales para configurar composición o ingredientes extra." });

            // El código es opcional: si viene vacío se guarda como null.
            var productCode = string.IsNullOrWhiteSpace(dto.CodigoProducto) ? null : dto.CodigoProducto.Trim().ToUpperInvariant();
            if (productCode != null && productCode.Length > 50)
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

            if (productCode != null && await _context.InvProductos.AnyAsync(p => p.CodigoProducto == productCode))
                return BadRequest(new { Mensaje = "Ya existe un producto con ese código" });

            var packError = await ValidatePackAsync(dto, null);
            if (packError != null) return BadRequest(new { Mensaje = packError });

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
                Stock = dto.EsPack ? null : (dto.RequiereReceta ? null : (dto.Stock ?? (materialsEnabled ? null : 0))),
                EsPack = dto.EsPack,
                IdProductoBase = dto.EsPack ? dto.IdProductoBase : null,
                CantidadPack = dto.EsPack ? dto.CantidadPack : null,
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
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto))
            {
                return BadRequest(new { Mensaje = "El nombre del producto es obligatorio" });
            }

            // El código es opcional: si viene vacío se guarda como null.
            var productCode = string.IsNullOrWhiteSpace(dto.CodigoProducto) ? null : dto.CodigoProducto.Trim().ToUpperInvariant();
            if (productCode != null && productCode.Length > 50)
                return BadRequest(new { Mensaje = "El código del producto no puede superar los 50 caracteres" });

            var product = await _context.InvProductos.FindAsync(id);
            if (product == null)
            {
                return NotFound(new { Mensaje = "Producto no encontrado" });
            }
            var materialsEnabled = await IsMaterialsModuleEnabledAsync();
            if (!materialsEnabled
                && (dto.RequiereReceta != (product.RequiereReceta ?? false)
                    || dto.AceptaIngredientesExtra != product.AceptaIngredientesExtra))
                return BadRequest(new { Mensaje = "Habilite el módulo Recetas y materiales para modificar la composición del producto." });

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

            if (productCode != null && await _context.InvProductos.AnyAsync(p => p.CodigoProducto == productCode && p.IdProducto != id))
                return BadRequest(new { Mensaje = "Ya existe otro producto con ese código" });

            var packError = await ValidatePackAsync(dto, id);
            if (packError != null) return BadRequest(new { Mensaje = packError });

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
            product.Stock = dto.EsPack ? null : (dto.RequiereReceta ? null : (dto.Stock ?? (materialsEnabled ? product.Stock : 0)));
            product.EsPack = dto.EsPack;
            product.IdProductoBase = dto.EsPack ? dto.IdProductoBase : null;
            product.CantidadPack = dto.EsPack ? dto.CantidadPack : null;
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

        private Task<bool> IsMaterialsModuleEnabledAsync() => _context.SegModulos.AsNoTracking().AnyAsync(module =>
            module.Codigo == "recetas" && module.Activo
            && (module.EsNucleo || (module.ConfiguracionOrganizacion != null && module.ConfiguracionOrganizacion.Habilitado)));

        // Valida la configuración de pack. Devuelve un mensaje de error o null si es válida.
        private async Task<string?> ValidatePackAsync(ProductDto dto, int? selfId)
        {
            if (!dto.EsPack) return null;
            if (dto.IdProductoBase == null || dto.CantidadPack == null || dto.CantidadPack <= 0)
                return "Un pack requiere un producto base y una cantidad por pack mayor a cero.";
            if (dto.IdProductoBase == selfId)
                return "Un pack no puede tener como base a sí mismo.";
            if (dto.RequiereReceta)
                return "Un pack no puede requerir receta.";
            var baseProd = await _context.InvProductos.AsNoTracking()
                .FirstOrDefaultAsync(p => p.IdProducto == dto.IdProductoBase);
            if (baseProd == null) return "El producto base del pack no existe.";
            if (baseProd.EsPack) return "El producto base no puede ser a su vez un pack.";
            return null;
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
