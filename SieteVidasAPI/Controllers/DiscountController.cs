using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DiscountController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public DiscountController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetDiscounts()
        {
            var discounts = await _context.InvDescuentosProductos
                .Include(d => d.IdProductoNavigation)
                .OrderByDescending(d => d.FechaRegistro)
                .Select(d => new
                {
                    d.IdDescuentoProducto,
                    d.IdProducto,
                    NombreProducto = d.IdProductoNavigation.NombreProducto,
                    PrecioOriginal = d.IdProductoNavigation.Precio,
                    d.PorcentajeDescuento,
                    d.FechaInicioDescuento,
                    d.FechaTerminoDescuento,
                    d.FechaRegistro,
                    d.Activo
                })
                .ToListAsync();
            return Ok(discounts);
        }

        [HttpPost]
        public async Task<IActionResult> CreateDiscount([FromBody] DiscountDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { Mensaje = "Datos de descuento inválidos" });
            }

            var product = await _context.InvProductos.FindAsync(dto.IdProducto);
            if (product == null)
            {
                return BadRequest(new { Mensaje = "Producto no encontrado" });
            }

            if (dto.PorcentajeDescuento <= 0 || dto.PorcentajeDescuento > 100)
            {
                return BadRequest(new { Mensaje = "El porcentaje de descuento debe estar entre 1 y 100" });
            }

            var discount = new InvDescuentosProductos
            {
                IdProducto = dto.IdProducto,
                PorcentajeDescuento = dto.PorcentajeDescuento,
                FechaInicioDescuento = dto.FechaInicioDescuento,
                FechaTerminoDescuento = dto.FechaTerminoDescuento,
                FechaRegistro = DateTime.Now,
                Activo = true
            };

            _context.InvDescuentosProductos.Add(discount);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                discount.IdDescuentoProducto,
                discount.IdProducto,
                NombreProducto = product.NombreProducto,
                PrecioOriginal = product.Precio,
                discount.PorcentajeDescuento,
                discount.FechaInicioDescuento,
                discount.FechaTerminoDescuento,
                discount.FechaRegistro,
                discount.Activo
            });
        }

        [HttpPut("{id}/status")]
        public async Task<IActionResult> ToggleStatus(int id)
        {
            var discount = await _context.InvDescuentosProductos
                .Include(d => d.IdProductoNavigation)
                .FirstOrDefaultAsync(d => d.IdDescuentoProducto == id);

            if (discount == null)
            {
                return NotFound(new { Mensaje = "Descuento no encontrado" });
            }

            discount.Activo = !discount.Activo;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                discount.IdDescuentoProducto,
                discount.IdProducto,
                NombreProducto = discount.IdProductoNavigation.NombreProducto,
                PrecioOriginal = discount.IdProductoNavigation.Precio,
                discount.PorcentajeDescuento,
                discount.FechaInicioDescuento,
                discount.FechaTerminoDescuento,
                discount.FechaRegistro,
                discount.Activo
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDiscount(int id)
        {
            var discount = await _context.InvDescuentosProductos.FindAsync(id);
            if (discount == null)
            {
                return NotFound(new { Mensaje = "Descuento no encontrado" });
            }

            _context.InvDescuentosProductos.Remove(discount);
            await _context.SaveChangesAsync();

            return Ok(new { Mensaje = "Descuento eliminado con éxito" });
        }
    }
}
