using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using SieteVidasAPI.DTOs;
using System;
using System.Threading.Tasks;

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
        public async Task<IActionResult> GetProducts()
        {
            var products = await _context.InvProductos
                .Include(p => p.IdCategoriaProductoNavigation)
                .OrderByDescending(p => p.FechaIngreso)
                .Select(p => new
                {
                    p.IdProducto,
                    p.IdCategoriaProducto,
                    NombreCategoriaProducto = p.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                    p.NombreProducto,
                    p.DescripcionProducto,
                    p.Precio,
                    p.Stock,
                    p.FechaIngreso,
                    p.Activo,
                    p.FechaModificacion,
                    ImagenBase64 = p.Imagen != null ? Convert.ToBase64String(p.Imagen) : null
                })
                .ToListAsync();
            return Ok(products);
        }

        [HttpPost]
        public async Task<IActionResult> CreateProduct([FromBody] ProductDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto))
            {
                return BadRequest(new { Mensaje = "El nombre del producto es obligatorio" });
            }

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
                NombreProducto = dto.NombreProducto,
                DescripcionProducto = dto.DescripcionProducto,
                Precio = dto.Precio,
                Stock = dto.Stock,
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
                NombreCategoriaProducto = category.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                product.FechaIngreso,
                product.Activo,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateProduct(int id, [FromBody] ProductDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreProducto))
            {
                return BadRequest(new { Mensaje = "El nombre del producto es obligatorio" });
            }

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
            product.NombreProducto = dto.NombreProducto;
            product.DescripcionProducto = dto.DescripcionProducto;
            product.Precio = dto.Precio;
            product.Stock = dto.Stock;
            product.FechaModificacion = DateTime.Now;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                product.IdProducto,
                product.IdCategoriaProducto,
                NombreCategoriaProducto = category.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                product.FechaIngreso,
                product.Activo,
                product.FechaModificacion,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }

        [HttpPut("{id}/status")]
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
                NombreCategoriaProducto = product.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                product.NombreProducto,
                product.DescripcionProducto,
                product.Precio,
                product.Stock,
                product.FechaIngreso,
                product.Activo,
                product.FechaModificacion,
                ImagenBase64 = product.Imagen != null ? Convert.ToBase64String(product.Imagen) : null
            });
        }
    }
}
