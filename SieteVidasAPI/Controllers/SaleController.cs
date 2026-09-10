using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.DTOs.Point;
using SieteVidasAPI.Services;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SaleController : ControllerBase
    {
        private readonly SieteVidasContext _context;
        private readonly ISaleLinesService _saleLines;
        private readonly IPointSaleService _pointSales;
        private readonly ISaleVoidService _saleVoid;

        public SaleController(
            SieteVidasContext context,
            ISaleLinesService saleLines,
            IPointSaleService pointSales,
            ISaleVoidService saleVoid)
        {
            _context = context;
            _saleLines = saleLines;
            _pointSales = pointSales;
            _saleVoid = saleVoid;
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
                    IdEstadoVenta = EstadosVenta.Terminada,
                    FechaVenta = DateTime.Now,
                    MontoTotal = 0,
                    MontoNeto = 0,
                    MontoIva = 0
                };

                _context.VenVentas.Add(sale);
                await _context.SaveChangesAsync(); // Generates IdVenta

                var lines = await _saleLines.BuildAsync(sale.IdVenta, dto.Items);
                if (!lines.EsValido)
                {
                    return BadRequest(new { mensaje = lines.Error });
                }

                int total = lines.Total;

                // Compute Net & VAT
                int neto = (int)Math.Round(total / 1.19);
                int iva = total - neto;

                sale.MontoTotal = total;
                sale.MontoNeto = neto;
                sale.MontoIva = iva;
                _context.Entry(sale).State = EntityState.Modified;

                // Validate payment methods sum
                int sumPayments = dto.MetodosPago?.Sum(m => m.Monto) ?? 0;
                if (sumPayments != total)
                {
                    return BadRequest(new { mensaje = $"La suma de los métodos de pago (${sumPayments.ToString("N0")}) debe ser igual al total de la venta (${total.ToString("N0")})." });
                }

                // Create payment method sale allocations
                if (dto.MetodosPago != null)
                {
                    foreach (var p in dto.MetodosPago)
                    {
                        if (p.Monto > 0)
                        {
                            var paymentAlloc = new VenMetodosPagoVenta
                            {
                                IdVenta = sale.IdVenta,
                                IdMetodoPago = p.IdMetodoPago,
                                Monto = p.Monto
                            };
                            _context.VenMetodosPagoVenta.Add(paymentAlloc);
                        }
                    }
                }

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

        /// <summary>
        /// Registra la venta como pendiente de pago y envía el monto con tarjeta a la
        /// terminal Point. La venta se confirma cuando Mercado Pago informa el resultado.
        /// </summary>
        [HttpPost("point")]
        public async Task<IActionResult> CreatePointSale([FromBody] PointSaleStartDto dto, CancellationToken cancellationToken)
        {
            if (dto == null)
            {
                return BadRequest(new { mensaje = "La solicitud de venta no es válida." });
            }

            var result = await _pointSales.StartAsync(dto, cancellationToken);

            return result.EsValido
                ? Ok(result.Value)
                : BadRequest(new { mensaje = result.Error });
        }

        /// <summary>
        /// Consulta el estado del cobro en Mercado Pago y lo aplica a la venta.
        /// El frontend lo usa como polling mientras el cliente paga en la terminal.
        /// </summary>
        [HttpPost("point/{idVenta}/sync")]
        public async Task<IActionResult> SyncPointSale(int idVenta, CancellationToken cancellationToken)
        {
            var result = await _pointSales.SyncAsync(idVenta, cancellationToken);

            return result.EsValido
                ? Ok(result.Value)
                : BadRequest(new { mensaje = result.Error });
        }

        /// <summary>
        /// Anula una venta terminada. Si incluyó pago con tarjeta, primero reembolsa
        /// en Mercado Pago: si la devolución falla, la venta no se anula.
        /// </summary>
        [HttpPost("{idVenta}/anular")]
        public async Task<IActionResult> AnularVenta(int idVenta, [FromBody] SaleVoidDto? dto, CancellationToken cancellationToken)
        {
            var result = await _saleVoid.AnularAsync(idVenta, dto?.DevolverStock ?? true, cancellationToken);

            return result.EsValido
                ? Ok(result.Value)
                : BadRequest(new { mensaje = result.Error });
        }

        [HttpGet("turn/{idTurno}")]
        public async Task<IActionResult> GetSalesByTurn(int idTurno)
        {
            // Las canceladas son intentos de cobro que nunca se concretaron: no son
            // parte del historial de ventas del turno. Las anuladas sí se muestran,
            // porque fueron ventas reales que después se revirtieron.
            var sales = await _context.VenVentas
                .Where(v => v.IdTurno == idTurno && v.IdEstadoVenta != EstadosVenta.Cancelada)
                .OrderByDescending(v => v.FechaVenta)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    v.IdEstadoVenta,
                    v.IdEstadoVentaNavigation.NombreEstadoVenta,
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
                        d.PrecioNormal,
                        d.PrecioUnitario,
                        d.Subtotal,
                        SeleccionesMateriales = d.VenDetalleVentaMateriales
                            .Where(m => m.EsEleccionAlternativa)
                            .Select(m => new
                            {
                                m.IdMateriaPrima,
                                NombreMateriaPrima = m.IdMateriaPrimaNavigation.NombreMaterial,
                                m.Recargo
                            })
                    })
                })
                .ToListAsync();

            return Ok(sales);
        }
    }
}
