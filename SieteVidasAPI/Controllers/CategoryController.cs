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
    public class CategoryController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public CategoryController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.CategoriesView + "|" + Permissions.SalesOperate)]
        public async Task<IActionResult> GetCategories()
        {
            var categories = await _context.InvCategoriaProductos
                .OrderByDescending(c => c.FechaIngreso)
                .ToListAsync();
            return Ok(categories);
        }

        [HttpPost]
        [Permission(Permissions.CategoriesCreate)]
        public async Task<IActionResult> CreateCategory([FromBody] CategoryDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreCategoriaProducto))
            {
                return BadRequest(new { Mensaje = "El nombre de la categoría es obligatorio" });
            }

            var existing = await _context.InvCategoriaProductos
                .FirstOrDefaultAsync(c => c.NombreCategoriaProducto.ToLower() == dto.NombreCategoriaProducto.ToLower());

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "La categoría ya existe" });
            }

            var category = new InvCategoriaProductos
            {
                NombreCategoriaProducto = dto.NombreCategoriaProducto,
                FechaIngreso = DateTime.Now,
                Activo = true
            };

            _context.InvCategoriaProductos.Add(category);
            await _context.SaveChangesAsync();

            return Ok(category);
        }

        [HttpPut("{id}")]
        [Permission(Permissions.CategoriesEdit)]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreCategoriaProducto))
            {
                return BadRequest(new { Mensaje = "El nombre de la categoría es obligatorio" });
            }

            var category = await _context.InvCategoriaProductos.FindAsync(id);
            if (category == null)
            {
                return NotFound(new { Mensaje = "Categoría no encontrada" });
            }

            var existing = await _context.InvCategoriaProductos
                .FirstOrDefaultAsync(c => c.NombreCategoriaProducto.ToLower() == dto.NombreCategoriaProducto.ToLower() && c.IdCategoriaProducto != id);

            if (existing != null)
            {
                return BadRequest(new { Mensaje = "Ya existe otra categoría con ese nombre" });
            }

            category.NombreCategoriaProducto = dto.NombreCategoriaProducto;
            category.FechaModificacion = DateTime.Now;

            await _context.SaveChangesAsync();

            return Ok(category);
        }

        [HttpPut("{id}/status")]
        [Permission(Permissions.CategoriesStatusEdit)]
        public async Task<IActionResult> ToggleStatus(int id)
        {
            var category = await _context.InvCategoriaProductos.FindAsync(id);
            if (category == null)
            {
                return NotFound(new { Mensaje = "Categoría no encontrada" });
            }

            category.Activo = !category.Activo;
            category.FechaModificacion = DateTime.Now;

            await _context.SaveChangesAsync();

            return Ok(category);
        }
    }
}
