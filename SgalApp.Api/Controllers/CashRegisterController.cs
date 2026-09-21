using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.DTOs.Point;
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
        private readonly ISaleLinesService _saleLines;
        private readonly IPointService _pointService;
        private readonly IPointSaleService _pointSales;
        private readonly IPosCredentialProvider _credentials;

        public CashRegisterController(
            SgalContext context,
            IPermissionService permissions,
            ISaleLinesService saleLines,
            IPointService pointService,
            IPointSaleService pointSales,
            IPosCredentialProvider credentials)
        {
            _context = context;
            _permissions = permissions;
            _saleLines = saleLines;
            _pointService = pointService;
            _pointSales = pointSales;
            _credentials = credentials;
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
                        Selecciones = d.VenDetalleVentaMateriales
                            .Where(m => m.EsEleccionAlternativa)
                            .Select(m => new
                            {
                                m.IdMateriaPrima,
                                NombreMateriaPrima = m.IdMateriaPrimaNavigation.NombreMaterial,
                                m.Recargo
                            }).ToList(),
                        Extras = d.VenDetalleVentaIngrediente
                            .Select(x => new
                            {
                                IdIngredienteExtra = x.IdMateriaPrima,
                                Nombre = x.IdMateriaPrimaNavigation.NombreMaterial,
                                x.Precio
                            }).ToList()
                    }).ToList()
                })
                .ToListAsync();

            // Para que la caja pueda editar un vale y reconstruir sus líneas, cada alternativa
            // elegida necesita su materia prima base (Id_Materia_Prima_Reemplazada de la receta).
            var productIds = pending.SelectMany(p => p.Items).Select(i => i.IdProducto).Distinct().ToList();
            var alternativas = productIds.Count == 0
                ? new List<(int Producto, int Alternativa, int Base)>()
                : (await _context.InvMaterialesReceta.AsNoTracking()
                    .Where(m => m.IdMateriaPrimaReemplazada != null
                        && m.IdRecetaNavigation.Estado
                        && productIds.Contains(m.IdRecetaNavigation.IdProducto))
                    .Select(m => new { Producto = m.IdRecetaNavigation.IdProducto, Alternativa = m.IdMateriaPrima, Base = m.IdMateriaPrimaReemplazada!.Value })
                    .ToListAsync())
                    .Select(x => (x.Producto, x.Alternativa, x.Base)).ToList();
            var baseByProdAlt = alternativas
                .GroupBy(x => (x.Producto, x.Alternativa))
                .ToDictionary(g => g.Key, g => g.First().Base);

            var result = pending.Select(p => new
            {
                p.IdVenta,
                p.FechaVenta,
                p.MontoTotal,
                p.Vendedor,
                Items = p.Items.Select(i => new
                {
                    i.IdProducto,
                    i.NombreProducto,
                    i.Cantidad,
                    i.PrecioNormal,
                    i.PrecioUnitario,
                    i.Subtotal,
                    SeleccionesMateriales = i.Selecciones.Select(s => new
                    {
                        s.IdMateriaPrima,
                        IdMateriaPrimaBase = baseByProdAlt.TryGetValue((i.IdProducto, s.IdMateriaPrima), out var b) ? b : (int?)null,
                        s.NombreMateriaPrima,
                        s.Recargo
                    }),
                    IngredientesExtra = i.Extras
                })
            });

            return Ok(result);
        }

        /// <summary>
        /// Reemplaza las líneas de un vale pendiente (el cajero agrega o quita productos antes
        /// de cobrar). Reconstruye el detalle con la misma lógica que una venta nueva.
        /// </summary>
        [HttpPut("{idVenta:int}/items")]
        [Permission(Permissions.CajaSaleModify)]
        public async Task<IActionResult> UpdateItems(int idVenta, [FromBody] SaleItemsUpdateDto dto)
        {
            if (dto?.Items == null || dto.Items.Count == 0)
                return BadRequest(new { mensaje = "El vale debe contener al menos un producto." });

            var cajaTurn = await _context.TurTurno.AnyAsync(t =>
                t.IdEstadoTurno == 1 && t.TipoTurno == TiposTurno.Caja && t.IdUsuario == User.GetUserId());
            if (!cajaTurn)
                return BadRequest(new { mensaje = "Debe abrir un turno de caja antes de modificar un vale." });

            var sale = await _context.VenVentas.FirstOrDefaultAsync(v => v.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "Solo se pueden modificar vales pendientes de cobro." });

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var lines = await _saleLines.ReplaceLinesAsync(idVenta, dto.Items, sale.IdTurno);
                if (!lines.EsValido)
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { mensaje = lines.Error });
                }

                int totalBruto = lines.Total;
                sale.MontoTotal = totalBruto;
                sale.MontoNeto = (int)Math.Round(totalBruto / 1.19);
                sale.MontoIva = totalBruto - sale.MontoNeto;
                _context.Entry(sale).State = EntityState.Modified;

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new { mensaje = "Vale actualizado.", idVenta = sale.IdVenta, montoTotal = totalBruto });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "Error interno al modificar el vale.", detalle = ex.Message });
            }
        }

        /// <summary>
        /// El cajero crea una venta nueva desde la caja: se registra como un vale pendiente
        /// contra su turno de caja, listo para cobrarse. No requiere el permiso de ventas.
        /// </summary>
        [HttpPost("sale")]
        [Permission(Permissions.CajaSaleModify)]
        public async Task<IActionResult> CreateSale([FromBody] SaleItemsUpdateDto dto)
        {
            if (dto?.Items == null || dto.Items.Count == 0)
                return BadRequest(new { mensaje = "La venta debe contener al menos un producto." });

            var cajaTurn = await _context.TurTurno.FirstOrDefaultAsync(t =>
                t.IdEstadoTurno == 1 && t.TipoTurno == TiposTurno.Caja && t.IdUsuario == User.GetUserId());
            if (cajaTurn == null)
                return BadRequest(new { mensaje = "Debe abrir un turno de caja antes de crear una venta." });

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var sale = new VenVentas
                {
                    IdTurno = cajaTurn.IdTurno,
                    IdUsuario = User.GetUserId(),
                    IdEstadoVenta = EstadosVenta.PendienteDePago,
                    FechaVenta = DateTime.Now,
                    MontoTotal = 0,
                    MontoNeto = 0,
                    MontoIva = 0
                };
                _context.VenVentas.Add(sale);
                await _context.SaveChangesAsync();

                var lines = await _saleLines.BuildAsync(sale.IdVenta, dto.Items, cajaTurn.IdTurno);
                if (!lines.EsValido)
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { mensaje = lines.Error });
                }

                int totalBruto = lines.Total;
                sale.MontoTotal = totalBruto;
                sale.MontoNeto = (int)Math.Round(totalBruto / 1.19);
                sale.MontoIva = totalBruto - sale.MontoNeto;
                _context.Entry(sale).State = EntityState.Modified;

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new { mensaje = "Venta creada.", idVenta = sale.IdVenta, montoTotal = totalBruto });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "Error interno al crear la venta.", detalle = ex.Message });
            }
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

            // Una asignación de débito/crédito solo es válida si proviene de la última
            // orden Point de este vale, ya aprobada por Mercado Pago y por el mismo monto.
            // Así Caja aplica la misma garantía que Ventas y no confía en el frontend.
            var pagosTarjeta = metodos
                .Where(m => m.IdMetodoPago is MetodosPago.Debito or MetodosPago.Credito)
                .ToList();
            if (pagosTarjeta.Count > 0)
            {
                if (pagosTarjeta.Count != 1)
                    return BadRequest(new { mensaje = "El cobro Point debe registrar un único tipo de tarjeta." });

                var ordenPoint = await _context.VenOrdenesPoint.AsNoTracking()
                    .Where(o => o.IdVenta == idVenta && o.EsCaja)
                    .OrderByDescending(o => o.IdOrdenPoint)
                    .FirstOrDefaultAsync();
                if (ordenPoint == null || !string.Equals(ordenPoint.Estado, "processed", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { mensaje = "El pago con tarjeta todavía no ha sido aprobado por Mercado Pago." });

                var metodoConfirmado = ordenPoint.TipoMedioPago switch
                {
                    "debit_card" => MetodosPago.Debito,
                    "credit_card" => MetodosPago.Credito,
                    _ => (int?)null
                };
                var pagoTarjeta = pagosTarjeta[0];
                if (!metodoConfirmado.HasValue || metodoConfirmado.Value != pagoTarjeta.IdMetodoPago)
                    return BadRequest(new { mensaje = "El tipo de tarjeta no coincide con el informado por Mercado Pago." });
                if (ordenPoint.Monto != pagoTarjeta.Monto)
                    return BadRequest(new { mensaje = "El monto con tarjeta no coincide con el aprobado por Mercado Pago." });
            }

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

        /// <summary>
        /// Inicia el cobro de la porción con tarjeta de un vale en la terminal POS (Point). La venta
        /// no cambia de estado: se cobra explícitamente con <c>collect</c> cuando la terminal aprueba.
        /// </summary>
        [HttpPost("{idVenta:int}/point/start")]
        [Permission(Permissions.CajaCollect)]
        public async Task<IActionResult> StartPoint(int idVenta, [FromBody] CashPointStartDto dto, CancellationToken cancellationToken)
        {
            if (dto == null || dto.MontoTarjeta <= 0)
                return BadRequest(new { mensaje = "El monto a cobrar con tarjeta debe ser mayor a cero." });

            var schemaError = await PointSchemaGuard.GetConfigurationErrorAsync(_context, cancellationToken);
            if (schemaError != null)
                return BadRequest(new { mensaje = schemaError });

            var cajaAbierta = await _context.TurTurno.AnyAsync(t =>
                t.IdEstadoTurno == 1 && t.TipoTurno == TiposTurno.Caja && t.IdUsuario == User.GetUserId(), cancellationToken);
            if (!cajaAbierta)
                return BadRequest(new { mensaje = "Debe abrir un turno de caja antes de cobrar." });

            var sale = await _context.VenVentas.Include(v => v.VenDetalleVenta)
                .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "La venta no es un vale pendiente de cobro." });

            var ultimaOrden = await _context.VenOrdenesPoint.AsNoTracking()
                .Where(o => o.IdVenta == idVenta && o.EsCaja)
                .OrderByDescending(o => o.IdOrdenPoint)
                .FirstOrDefaultAsync(cancellationToken);
            if (ultimaOrden != null && !new[] { "canceled", "failed", "expired", "refunded" }
                    .Contains(ultimaOrden.Estado, StringComparer.OrdinalIgnoreCase))
            {
                var mensaje = string.Equals(ultimaOrden.Estado, "processed", StringComparison.OrdinalIgnoreCase)
                    ? "Este vale ya tiene un pago con tarjeta aprobado. Complete el cierre en lugar de iniciar otro cobro."
                    : "Este vale ya tiene un cobro con tarjeta en curso.";
                return Conflict(new { mensaje });
            }

            int totalBruto = sale.VenDetalleVenta.Sum(d => d.Subtotal);
            int montoDescuento = 0;
            if (dto.PorcentajeDescuento != 0)
            {
                if (dto.PorcentajeDescuento < 0)
                    return BadRequest(new { mensaje = "El descuento no puede ser negativo." });
                var maxDescuento = await _permissions.GetMaxDiscountPercentAsync(User.GetUserId());
                if (dto.PorcentajeDescuento > maxDescuento)
                    return BadRequest(new { mensaje = $"El descuento máximo que puede aplicar es {maxDescuento:0.##}%." });
                montoDescuento = (int)Math.Round(totalBruto * dto.PorcentajeDescuento / 100m, MidpointRounding.AwayFromZero);
            }
            int total = totalBruto - montoDescuento;
            if (dto.MontoTarjeta > total)
                return BadRequest(new { mensaje = "El monto con tarjeta no puede superar el total a cobrar." });

            var referencia = $"CJ{sale.IdVenta}_{DateTime.Now:yyyyMMddHHmmss}";
            PointOrder order;
            try
            {
                order = await _pointService.CreateOrderAsync(new PointOrderCreateDto
                {
                    Monto = dto.MontoTarjeta,
                    ReferenciaExterna = referencia,
                    Descripcion = $"Cobro caja venta {sale.IdVenta}"
                }, cancellationToken);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensaje = ex.Message });
            }
            catch (PointApiException ex)
            {
                return BadRequest(new { mensaje = ex.ResponseBody != null ? $"La terminal rechazó el cobro: {ex.ResponseBody}" : "No se pudo enviar el cobro a la terminal." });
            }
            catch (Exception)
            {
                return BadRequest(new { mensaje = "No se pudo enviar el cobro a la terminal." });
            }

            var registro = new VenOrdenesPoint
            {
                IdOrdenMp = order.Id!,
                ReferenciaExterna = referencia,
                IdVenta = sale.IdVenta,
                EsCaja = true,
                IdTerminal = order.Config?.Point?.TerminalId ?? string.Empty,
                Monto = dto.MontoTarjeta,
                Estado = order.Status ?? "created",
                DetalleEstado = order.StatusDetail,
                FechaCreacion = DateTime.Now,
                FechaActualizacion = DateTime.Now
            };
            _context.VenOrdenesPoint.Add(registro);
            try
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception)
            {
                // La orden ya fue enviada a la terminal. Si no podemos asociarla al
                // vale, la retiramos para evitar un cobro huérfano.
                try { await _pointService.CancelOrderAsync(order.Id, cancellationToken); }
                catch { /* Se conserva el error original; la terminal requerirá cancelación manual. */ }
                return StatusCode(500, new { mensaje = "No se pudo registrar el cobro. La orden fue retirada de la terminal." });
            }

            var creds = await _credentials.ResolveMercadoPagoAsync(cancellationToken);
            var terminalId = order.Config?.Point?.TerminalId ?? creds.TerminalId;
            if (creds.AllowSimulation && creds.AutoSimulate
                && terminalId.EndsWith("__SBX0000001", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    await _pointService.SimulateOrderAsync(order.Id, PointSimulationFactory.BuildRandom(), cancellationToken);
                }
                catch { /* La orden queda pendiente y puede simularse manualmente. */ }
            }

            return Ok(new { idOrden = order.Id, referenciaExterna = referencia, montoTarjeta = dto.MontoTarjeta });
        }

        /// <summary>
        /// Cancela el último cobro Point pendiente de un vale desde la caja que lo está procesando.
        /// </summary>
        [HttpPost("point/{idVenta:int}/cancel")]
        [Permission(Permissions.CajaCollect)]
        public async Task<IActionResult> CancelPoint(int idVenta, CancellationToken cancellationToken)
        {
            var cajaAbierta = await _context.TurTurno.AnyAsync(t =>
                t.IdEstadoTurno == 1 && t.TipoTurno == TiposTurno.Caja && t.IdUsuario == User.GetUserId(), cancellationToken);
            if (!cajaAbierta)
                return BadRequest(new { mensaje = "Debe tener un turno de caja abierto para cancelar el cobro." });

            var registro = await _context.VenOrdenesPoint
                .Where(o => o.IdVenta == idVenta && o.EsCaja)
                .OrderByDescending(o => o.IdOrdenPoint)
                .FirstOrDefaultAsync(cancellationToken);
            if (registro == null)
                return BadRequest(new { mensaje = "El vale no tiene un cobro con tarjeta iniciado." });

            try
            {
                var order = await _pointService.CancelOrderAsync(registro.IdOrdenMp, cancellationToken);
                await _pointSales.HandleOrderUpdateAsync(order, cancellationToken);
                return Ok(new { estadoOrden = registro.Estado });
            }
            catch (PointApiException ex)
            {
                return BadRequest(new
                {
                    mensaje = ex.ResponseBody != null
                        ? $"La terminal no pudo cancelar el cobro: {ex.ResponseBody}"
                        : "No fue posible cancelar el cobro en la terminal."
                });
            }
        }

        /// <summary>
        /// Consulta el estado del cobro con tarjeta en la terminal (sondeo). No finaliza la venta:
        /// cuando el estado es "processed" el frontend cobra el vale con la tarjeta como método.
        /// </summary>
        [HttpPost("point/{idVenta:int}/sync")]
        [Permission(Permissions.CajaCollect)]
        public async Task<IActionResult> SyncPoint(int idVenta, CancellationToken cancellationToken)
        {
            var registro = await _context.VenOrdenesPoint
                .Where(o => o.IdVenta == idVenta && o.EsCaja)
                .OrderByDescending(o => o.IdOrdenPoint)
                .FirstOrDefaultAsync(cancellationToken);
            if (registro == null)
                return BadRequest(new { mensaje = "El vale no tiene un cobro con tarjeta iniciado." });

            PointOrder order;
            try
            {
                order = await _pointService.GetOrderAsync(registro.IdOrdenMp, cancellationToken);
            }
            catch (PointApiException)
            {
                return BadRequest(new { mensaje = "No se pudo consultar el estado del cobro en la terminal." });
            }

            await _pointSales.HandleOrderUpdateAsync(order, cancellationToken);
            await _context.Entry(registro).ReloadAsync(cancellationToken);

            int? idMetodoPago = registro.TipoMedioPago switch
            {
                "debit_card" => MetodosPago.Debito,
                "credit_card" => MetodosPago.Credito,
                _ => (int?)null
            };

            return Ok(new
            {
                estadoOrden = registro.Estado,
                tipoMedioPago = registro.TipoMedioPago,
                idMetodoPago,
                monto = registro.Monto
            });
        }
    }
}
