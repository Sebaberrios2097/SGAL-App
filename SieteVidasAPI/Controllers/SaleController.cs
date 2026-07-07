using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using SieteVidasAPI.DTOs;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SaleController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public SaleController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> CreateSale([FromBody] SaleCreateDto dto)
        {
            if (dto == null || dto.Items == null || !dto.Items.Any())
            {
                return BadRequest(new { mensaje = "La venta debe contener al menos un producto." });
            }

            // Check if active turn exists and is open
            var turn = await _context.TurTurno.FindAsync(dto.IdTurno);
            if (turn == null || turn.IdEstadoTurno != 1) // 1 = Abierto
            {
                return BadRequest(new { mensaje = "El turno especificado no existe o no se encuentra abierto." });
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Initialize sale header
                var sale = new VenVentas
                {
                    IdTurno = dto.IdTurno,
                    IdEstadoVenta = 1, // 1 = Completada / Pagada
                    FechaVenta = DateTime.Now,
                    MontoTotal = 0,
                    MontoNeto = 0,
                    MontoIva = 0
                };

                _context.VenVentas.Add(sale);
                await _context.SaveChangesAsync(); // Generates IdVenta

                int total = 0;

                foreach (var item in dto.Items)
                {
                    var prod = await _context.InvProductos.FindAsync(item.IdProducto);
                    if (prod == null || !prod.Activo)
                    {
                        return BadRequest(new { mensaje = $"El producto con ID {item.IdProducto} no existe o no está activo." });
                    }

                    // Stock check and deduction
                    if (prod.Stock.HasValue)
                    {
                        if (prod.Stock.Value < item.Cantidad)
                        {
                            return BadRequest(new { mensaje = $"Stock insuficiente para el producto: {prod.NombreProducto}. Stock disponible: {prod.Stock.Value}." });
                        }
                        prod.Stock -= item.Cantidad;
                        _context.Entry(prod).State = EntityState.Modified;
                    }

                    // Check for active discounts on this product
                    int finalUnitPrice = prod.Precio;
                    var activeDiscount = await _context.InvDescuentosProductos
                        .FirstOrDefaultAsync(d => d.IdProducto == prod.IdProducto && d.Activo &&
                                                  DateTime.Now >= d.FechaInicioDescuento &&
                                                  (!d.FechaTerminoDescuento.HasValue || DateTime.Now <= d.FechaTerminoDescuento.Value));

                    if (activeDiscount != null)
                    {
                        decimal discountVal = (prod.Precio * activeDiscount.PorcentajeDescuento) / 100m;
                        finalUnitPrice = (int)Math.Round(prod.Precio - discountVal);
                    }

                    int subtotal = finalUnitPrice * item.Cantidad;
                    total += subtotal;

                    // Create sale detail
                    var detail = new VenDetalleVenta
                    {
                        IdVenta = sale.IdVenta,
                        IdProducto = prod.IdProducto,
                        Cantidad = item.Cantidad,
                        PrecioNormal = prod.Precio,
                        PrecioUnitario = finalUnitPrice,
                        Subtotal = subtotal,
                        IndExento = false
                    };

                    _context.VenDetalleVenta.Add(detail);
                }

                // Compute Net & VAT
                int neto = (int)Math.Round(total / 1.19);
                int iva = total - neto;

                sale.MontoTotal = total;
                sale.MontoNeto = neto;
                sale.MontoIva = iva;
                _context.Entry(sale).State = EntityState.Modified;

                // Create payment method sale allocation
                var paymentAlloc = new VenMetodosPagoVenta
                {
                    IdVenta = sale.IdVenta,
                    IdMetodoPago = dto.IdMetodoPago,
                    Monto = total
                };

                _context.VenMetodosPagoVenta.Add(paymentAlloc);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    mensaje = "Venta registrada con éxito",
                    idVenta = sale.IdVenta,
                    montoTotal = total
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "Error interno al procesar la venta.", detalle = ex.Message });
            }
        }

        [HttpGet("turn/{idTurno}")]
        public async Task<IActionResult> GetSalesByTurn(int idTurno)
        {
            var sales = await _context.VenVentas
                .Where(v => v.IdTurno == idTurno)
                .OrderByDescending(v => v.FechaVenta)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    MetodosPago = v.VenMetodosPagoVenta.Select(mp => new
                    {
                        mp.IdMetodoPago,
                        mp.IdMetodoPagoNavigation.NombreMetodoPago,
                        mp.Monto
                    }),
                    Items = v.VenDetalleVenta.Select(d => new
                    {
                        d.IdProducto,
                        d.IdProductoNavigation.NombreProducto,
                        d.Cantidad,
                        d.PrecioUnitario,
                        d.Subtotal
                    })
                })
                .ToListAsync();

            return Ok(sales);
        }
    }
}
