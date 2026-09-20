using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Services;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers
{
    /// <summary>
    /// Módulo Caja: el cajero cobra los vales (ventas PendienteDePago) generados por los
    /// vendedores. El cobro atribuye el dinero al turno de caja del cajero (Id_Turno_Caja)
    /// y transiciona la venta a Terminada. Requiere el módulo Caja habilitado, lo que se
    /// garantiza porque los permisos caja.* pertenecen a ese módulo.
    /// </summary>
    [ApiController]
    [Route("api/cash-register")]
    public class CashRegisterController : ControllerBase
    {
        private readonly SgalContext _context;
        private readonly IPermissionService _permissions;

        public CashRegisterController(SgalContext context, IPermissionService permissions)
        {
            _context = context;
            _permissions = permissions;
        }

        /// <summary>Vales pendientes de cobro: ventas PendienteDePago aún no cobradas en caja.</summary>
        [HttpGet("pending")]
        [Permission(Permissions.CajaOperate + "|" + Permissions.CajaCollect)]
        public async Task<IActionResult> GetPending()
        {
            var pending = await _context.VenVentas
                .Where(v => v.IdEstadoVenta == EstadosVenta.PendienteDePago
                    && v.IdBitacora == null && v.IdTurnoCaja == null)
                .OrderBy(v => v.FechaVenta)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    Vendedor = v.IdUsuarioNavigation.EmpEmpleados.Where(e => e.Activo)
                        .Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault()
                        ?? v.IdUsuarioNavigation.NombreUsuario,
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
                            }),
                        IngredientesExtra = d.VenDetalleVentaIngrediente
                            .Select(x => new
                            {
                                IdIngredienteExtra = x.IdMateriaPrima,
                                Nombre = x.IdMateriaPrimaNavigation.NombreMaterial,
                                x.Precio
                            })
                    })
                })
                .ToListAsync();

            return Ok(pending);
        }

        /// <summary>Cobra un vale pendiente y lo transiciona a Terminada.</summary>
        [HttpPost("{idVenta:int}/collect")]
        [Permission(Permissions.CajaCollect)]
        public async Task<IActionResult> Collect(int idVenta, [FromBody] CashCollectDto dto)
        {
            if (dto == null) return BadRequest(new { mensaje = "Datos de cobro no válidos." });

            // El cajero debe tener un turno de caja abierto propio.
            var cajaTurn = await _context.TurTurno.FirstOrDefaultAsync(t =>
                t.IdEstadoTurno == 1 && t.TipoTurno == TiposTurno.Caja && t.IdUsuario == User.GetUserId());
            if (cajaTurn == null)
                return BadRequest(new { mensaje = "Debe abrir un turno de caja antes de cobrar." });

            var sale = await _context.VenVentas
                .Include(v => v.VenDetalleVenta)
                .FirstOrDefaultAsync(v => v.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null)
                return BadRequest(new { mensaje = "La venta no es un vale pendiente de cobro." });
            if (sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "El vale ya fue cobrado." });

            // El total bruto proviene del detalle ya construido al generar el vale.
            int totalBruto = sale.VenDetalleVenta.Sum(d => d.Subtotal);

            decimal porcentajeDescuento = dto.PorcentajeDescuento;
            int montoDescuento = 0;
            if (porcentajeDescuento != 0)
            {
                if (porcentajeDescuento < 0)
                    return BadRequest(new { mensaje = "El descuento no puede ser negativo." });
                var maxDescuento = await _permissions.GetMaxDiscountPercentAsync(User.GetUserId());
                if (maxDescuento <= 0)
                    return BadRequest(new { mensaje = "No tiene permiso para aplicar descuentos." });
                if (porcentajeDescuento > maxDescuento)
                    return BadRequest(new { mensaje = $"El descuento máximo que puede aplicar es {maxDescuento:0.##}%." });
                montoDescuento = (int)Math.Round(totalBruto * porcentajeDescuento / 100m, MidpointRounding.AwayFromZero);
            }

            int total = totalBruto - montoDescuento;

            var metodos = dto.MetodosPago?.Where(m => m.Monto > 0).ToList() ?? new List<SalePaymentMethodDto>();
            var metodosValidos = new[] { MetodosPago.Efectivo, MetodosPago.Debito, MetodosPago.Credito, MetodosPago.Transferencia };
            if (metodos.Any(m => !metodosValidos.Contains(m.IdMetodoPago)))
                return BadRequest(new { mensaje = "Método de pago no válido." });

            int sumPayments = metodos.Sum(m => m.Monto);
            if (sumPayments != total)
                return BadRequest(new { mensaje = $"La suma de los métodos de pago (${sumPayments:N0}) debe ser igual al total a cobrar (${total:N0})." });

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                foreach (var p in metodos)
                    _context.VenMetodosPagoVenta.Add(new VenMetodosPagoVenta
                    {
                        IdVenta = sale.IdVenta,
                        IdMetodoPago = p.IdMetodoPago,
                        Monto = p.Monto
                    });

                sale.IdTurnoCaja = cajaTurn.IdTurno;
                sale.PorcentajeDescuento = porcentajeDescuento;
                sale.MontoDescuento = montoDescuento;
                sale.MontoTotal = total;
                sale.MontoNeto = (int)Math.Round(total / 1.19);
                sale.MontoIva = total - sale.MontoNeto;
                sale.IdEstadoVenta = EstadosVenta.Terminada;
                _context.Entry(sale).State = EntityState.Modified;

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    mensaje = "Venta cobrada con éxito.",
                    idVenta = sale.IdVenta,
                    montoTotal = total,
                    montoDescuento
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "Error interno al procesar el cobro.", detalle = ex.Message });
            }
        }
    }
}
