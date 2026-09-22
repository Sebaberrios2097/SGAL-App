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
    [ApiController]
    [Route("api/[controller]")]
    public class SaleController : ControllerBase
    {
        private readonly SgalContext _context;
        private readonly ISaleLinesService _saleLines;
        private readonly IPointSaleService _pointSales;
        private readonly ISaleVoidService _saleVoid;
        private readonly IPermissionService _permissions;

        public SaleController(
            SgalContext context,
            ISaleLinesService saleLines,
            IPointSaleService pointSales,
            ISaleVoidService saleVoid,
            IPermissionService permissions)
        {
            _context = context;
            _saleLines = saleLines;
            _pointSales = pointSales;
            _saleVoid = saleVoid;
            _permissions = permissions;
        }

        [HttpPost]
        [Permission(Permissions.SalesCreate)]
        public async Task<IActionResult> CreateSale([FromBody] SaleCreateDto dto)
        {
            if (dto == null || ((dto.Items?.Count ?? 0) == 0 && (dto.Promociones?.Count ?? 0) == 0))
                return BadRequest(new { mensaje = "La venta debe contener al menos un producto o promoción." });
            if (dto.EsConsumoEmpleado && (dto.Promociones?.Count ?? 0) > 0)
                return BadRequest(new { mensaje = "Las promociones no se aplican a consumos de empleado." });

            var turnsEnabled = await AreTurnsEnabledAsync();
            TurTurno? turn = null;
            if (turnsEnabled)
            {
                if (!dto.IdTurno.HasValue)
                    return BadRequest(new { mensaje = "Debe iniciar un turno antes de realizar ventas." });
                turn = await _context.TurTurno.FindAsync(dto.IdTurno.Value);
                if (turn == null || turn.IdEstadoTurno != 1)
                    return BadRequest(new { mensaje = "El turno especificado no existe o no se encuentra abierto." });
                if (turn.IdUsuario != User.GetUserId()) return Forbid();
            }
            else if (dto.EsConsumoEmpleado)
            {
                return BadRequest(new { mensaje = "Los consumos de empleado requieren el módulo Turnos." });
            }
            var idTurno = turnsEnabled ? dto.IdTurno : null;

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Consumo de empleado: se asocia a la bitácora del turno (se crea si no existe) y
                // queda por cobrar. La cortesía se aplica automáticamente por línea.
                int? idBitacora = null;
                if (dto.EsConsumoEmpleado)
                {
                    var requiredTurnId = idTurno ?? throw new InvalidOperationException("El consumo de empleado requiere un turno activo.");
                    var logbook = await _context.TurBitacora.FirstOrDefaultAsync(b => b.IdTurno == requiredTurnId);
                    if (logbook == null)
                    {
                        logbook = new TurBitacora { IdTurno = requiredTurnId, FechaCreacion = DateTime.Now };
                        _context.TurBitacora.Add(logbook);
                        await _context.SaveChangesAsync();
                    }
                    idBitacora = logbook.IdBitacora;
                }

                // Initialize sale header
                var sale = new VenVentas
                {
                    IdTurno = idTurno,
                    IdUsuario = User.GetUserId(),
                    IdBitacora = idBitacora,
                    IdEstadoVenta = EstadosVenta.Terminada,
                    FechaVenta = DateTime.Now,
                    MontoTotal = 0,
                    MontoNeto = 0,
                    MontoIva = 0
                };

                _context.VenVentas.Add(sale);
                await _context.SaveChangesAsync(); // Generates IdVenta

                var lines = dto.EsConsumoEmpleado
                    ? await _saleLines.BuildAsync(sale.IdVenta, dto.Items ?? [], idTurno, true, User.GetUserId(), default)
                    : await _saleLines.BuildAsync(sale.IdVenta, dto.Items ?? [], dto.Promociones, idTurno);
                if (!lines.EsValido)
                {
                    return BadRequest(new { mensaje = lines.Error });
                }

                // Consumo de empleado: por cobrar (sin descuento manual ni métodos de pago). El
                // monto total es lo adeudado (excluye cortesías).
                if (dto.EsConsumoEmpleado)
                {
                    int adeudado = lines.Total;
                    sale.MontoTotal = adeudado;
                    sale.MontoNeto = (int)Math.Round(adeudado / 1.19);
                    sale.MontoIva = adeudado - sale.MontoNeto;
                    _context.Entry(sale).State = EntityState.Modified;
                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();
                    return Ok(new
                    {
                        mensaje = "Consumo de empleado registrado.",
                        idVenta = sale.IdVenta,
                        montoAdeudado = adeudado,
                        montoCortesia = lines.MontoCortesia
                    });
                }

                int totalBruto = lines.Total;

                // Con el módulo Caja habilitado, el vendedor solo genera la orden: se emite
                // un vale pendiente de pago y el cobro (descuento y métodos de pago) ocurre
                // en caja. Sin Caja, la venta se cobra aquí mismo (flujo original).
                if (await IsCajaEnabledAsync())
                {
                    sale.IdEstadoVenta = EstadosVenta.PendienteDePago;
                    sale.MontoTotal = totalBruto;
                    sale.MontoNeto = (int)Math.Round(totalBruto / 1.19);
                    sale.MontoIva = totalBruto - sale.MontoNeto;
                    _context.Entry(sale).State = EntityState.Modified;
                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();
                    return Ok(new
                    {
                        mensaje = "Vale generado. Pendiente de cobro en caja.",
                        idVenta = sale.IdVenta,
                        montoTotal = totalBruto,
                        pendiente = true
                    });
                }

                // Descuento opcional aplicado al cobro. Se valida contra el % máximo del usuario.
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

                // Compute Net & VAT
                int neto = (int)Math.Round(total / 1.19);
                int iva = total - neto;

                sale.MontoTotal = total;
                sale.MontoNeto = neto;
                sale.MontoIva = iva;
                sale.PorcentajeDescuento = porcentajeDescuento;
                sale.MontoDescuento = montoDescuento;
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
        [Permission(Permissions.SalesCreatePoint)]
        public async Task<IActionResult> CreatePointSale([FromBody] PointSaleStartDto dto, CancellationToken cancellationToken)
        {
            if (dto == null)
            {
                return BadRequest(new { mensaje = "La solicitud de venta no es válida." });
            }
            // Descuento opcional: se valida el % máximo del usuario antes de enviar a la terminal.
            if (dto.PorcentajeDescuento != 0)
            {
                if (dto.PorcentajeDescuento < 0)
                    return BadRequest(new { mensaje = "El descuento no puede ser negativo." });
                var maxDescuento = await _permissions.GetMaxDiscountPercentAsync(User.GetUserId());
                if (maxDescuento <= 0)
                    return BadRequest(new { mensaje = "No tiene permiso para aplicar descuentos." });
                if (dto.PorcentajeDescuento > maxDescuento)
                    return BadRequest(new { mensaje = $"El descuento máximo que puede aplicar es {maxDescuento:0.##}%." });
            }

            var result = await _pointSales.StartAsync(dto, User.GetUserId(), cancellationToken);

            return result.EsValido
                ? Ok(result.Value)
                : BadRequest(new { mensaje = result.Error });
        }

        /// <summary>
        /// Consulta el estado del cobro en Mercado Pago y lo aplica a la venta.
        /// El frontend lo usa como polling mientras el cliente paga en la terminal.
        /// </summary>
        [HttpPost("point/{idVenta}/sync")]
        [Permission(Permissions.SalesCreatePoint)]
        public async Task<IActionResult> SyncPointSale(int idVenta, CancellationToken cancellationToken)
        {
            if (!await SaleBelongsToCurrentUser(idVenta)) return Forbid();
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
        [Permission(Permissions.SalesVoid)]
        public async Task<IActionResult> AnularVenta(int idVenta, [FromBody] SaleVoidDto? dto, CancellationToken cancellationToken)
        {
            if (!await SaleBelongsToCurrentUser(idVenta)) return Forbid();
            var result = await _saleVoid.AnularAsync(idVenta, dto?.DevolverStock ?? true, cancellationToken);

            return result.EsValido
                ? Ok(result.Value)
                : BadRequest(new { mensaje = result.Error });
        }

        /// <summary>
        /// Marca la comanda (preparación) de una venta como terminada o la reabre.
        /// El estado vive en la venta: Fecha_Comanda_Terminada NULL = pendiente.
        /// </summary>
        [HttpPost("{idVenta}/comanda")]
        [Permission(Permissions.SalesComandasManage)]
        public async Task<IActionResult> ActualizarComanda(int idVenta, [FromBody] ComandaEstadoDto dto)
        {
            if (!await SaleBelongsToCurrentUser(idVenta)) return Forbid();

            var venta = await _context.VenVentas.FirstOrDefaultAsync(x => x.IdVenta == idVenta);
            if (venta == null) return NotFound(new { mensaje = "Venta no encontrada." });

            // Solo las ventas concretadas tienen comanda que preparar.
            if (venta.IdEstadoVenta != EstadosVenta.Terminada)
                return BadRequest(new { mensaje = "La venta no está en un estado con comanda activa." });

            venta.FechaComandaTerminada = dto.Terminada ? DateTime.Now : null;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                venta.IdVenta,
                ComandaTerminada = venta.FechaComandaTerminada != null,
                venta.FechaComandaTerminada
            });
        }

        [HttpGet("turn/{idTurno}")]
        [Permission(Permissions.OwnSalesView + "|" + Permissions.TurnRecordsSalesView + "|" + Permissions.SalesComandasManage)]
        public async Task<IActionResult> GetSalesByTurn(int idTurno)
        {
            var ownsTurn = await _context.TurTurno.AnyAsync(x => x.IdTurno == idTurno && x.IdUsuario == User.GetUserId());
            if (!ownsTurn && !await _permissions.HasPermissionAsync(User.GetUserId(), Permissions.TurnRecordsSalesView))
                return Forbid();
            // Las canceladas son intentos de cobro que nunca se concretaron: no son
            // parte del historial de ventas del turno. Las anuladas sí se muestran,
            // porque fueron ventas reales que después se revirtieron.
            // Los consumos de empleado (Id_Bitacora != null) no son ventas normales del turno:
            // se ven en la bitácora y en el panel de turnos, no en este listado ni en la caja.
            var sales = await _context.VenVentas
                .Where(v => v.IdTurno == idTurno && v.IdEstadoVenta != EstadosVenta.Cancelada && v.IdBitacora == null)
                .OrderByDescending(v => v.FechaVenta)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    v.IdEstadoVenta,
                    v.IdEstadoVentaNavigation.NombreEstadoVenta,
                    v.FechaComandaTerminada,
                    ComandaTerminada = v.FechaComandaTerminada != null,
                    MetodosPago = v.VenMetodosPagoVenta.Select(mp => new
                    {
                        mp.IdMetodoPago,
                        mp.IdMetodoPagoNavigation.NombreMetodoPago,
                        mp.Monto
                    }),
                    Promociones = v.VenVentaPromociones.Select(p => new
                    {
                        p.IdVentaPromocion,
                        p.IdPromocion,
                        p.IdPromocionNavigation.Nombre,
                        p.Cantidad,
                        p.Precio,
                        p.MontoIndividual,
                        p.Descuento,
                        Productos = p.Lineas.Select(l => new { l.IdProducto, l.IdProductoNavigation.NombreProducto, l.Cantidad })
                    }),
                    Items = v.VenDetalleVenta.Select(d => new
                    {
                        d.IdVentaPromocion,
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

            return Ok(sales);
        }

        [HttpGet("mine")]
        [Permission(Permissions.OwnSalesView + "|" + Permissions.SalesComandasManage)]
        public async Task<IActionResult> GetMySales()
        {
            var userId = User.GetUserId();
            var sales = await _context.VenVentas
                .Where(v => v.IdUsuario == userId && v.IdEstadoVenta != EstadosVenta.Cancelada && v.IdBitacora == null)
                .OrderByDescending(v => v.FechaVenta)
                .Take(250)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    v.IdEstadoVenta,
                    v.IdEstadoVentaNavigation.NombreEstadoVenta,
                    v.FechaComandaTerminada,
                    ComandaTerminada = v.FechaComandaTerminada != null,
                    MetodosPago = v.VenMetodosPagoVenta.Select(mp => new
                    {
                        mp.IdMetodoPago,
                        mp.IdMetodoPagoNavigation.NombreMetodoPago,
                        mp.Monto
                    }),
                    Promociones = v.VenVentaPromociones.Select(p => new
                    {
                        p.IdVentaPromocion,
                        p.IdPromocion,
                        p.IdPromocionNavigation.Nombre,
                        p.Cantidad,
                        p.Precio,
                        p.MontoIndividual,
                        p.Descuento,
                        Productos = p.Lineas.Select(l => new { l.IdProducto, l.IdProductoNavigation.NombreProducto, l.Cantidad })
                    }),
                    Items = v.VenDetalleVenta.Select(d => new
                    {
                        d.IdVentaPromocion,
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

            return Ok(sales);
        }

        /// <summary>
        /// El administrador marca (o desmarca) como pagada por el empleado una venta de consumo,
        /// para no descontarla nuevamente en el futuro.
        /// </summary>
        [HttpPut("{idVenta:int}/consumption-paid")]
        [Permission(Permissions.ConsumptionsMarkPaid)]
        public async Task<IActionResult> SetConsumptionPaid(int idVenta, [FromBody] ConsumptionPaidDto dto)
        {
            var sale = await _context.VenVentas.FirstOrDefaultAsync(v => v.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdBitacora == null)
                return BadRequest(new { mensaje = "La venta no es un consumo de empleado." });

            sale.PagadoPorEmpleado = dto.Pagado;
            await _context.SaveChangesAsync();
            return Ok(new { sale.IdVenta, sale.PagadoPorEmpleado });
        }

        /// <summary>
        /// Recupera las líneas de un vale pendiente en forma de carrito, para volver a cargarlo
        /// (al reescanear el ticket) en Ventas o en Caja. Solo vales aún no cobrados.
        /// </summary>
        [HttpGet("{idVenta:int}/items")]
        [Permission(Permissions.SalesCreate + "|" + Permissions.CajaCollect + "|" + Permissions.CajaSaleModify)]
        public async Task<IActionResult> GetSaleItems(int idVenta)
        {
            var sale = await _context.VenVentas
                .Where(v => v.IdVenta == idVenta)
                .Select(v => new
                {
                    v.IdVenta,
                    v.MontoTotal,
                    v.IdEstadoVenta,
                    v.IdBitacora,
                    v.IdTurnoCaja,
                    Items = v.VenDetalleVenta.Select(d => new
                    {
                        d.IdVentaPromocion,
                        d.IdProducto,
                        d.IdProductoNavigation.NombreProducto,
                        d.Cantidad,
                        d.PrecioNormal,
                        d.PrecioUnitario,
                        d.Subtotal,
                        Selecciones = d.VenDetalleVentaMateriales
                            .Where(m => m.EsEleccionAlternativa)
                            .Select(m => new { m.IdMateriaPrima, NombreMateriaPrima = m.IdMateriaPrimaNavigation.NombreMaterial, m.Recargo }).ToList(),
                        Extras = d.VenDetalleVentaIngrediente
                            .Select(x => new { IdIngredienteExtra = x.IdMateriaPrima, Nombre = x.IdMateriaPrimaNavigation.NombreMaterial, x.Precio }).ToList()
                    }).ToList()
                })
                .FirstOrDefaultAsync();

            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "La venta no está disponible: ya fue cobrada o no es un vale pendiente." });

            var productIds = sale.Items.Select(i => i.IdProducto).Distinct().ToList();
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

            var promocionesAplicadas = await _context.VenVentaPromociones.AsNoTracking()
                .Where(p => p.IdVenta == idVenta)
                .Include(p => p.IdPromocionNavigation).ThenInclude(p => p.Grupos).ThenInclude(g => g.Productos)
                .Include(p => p.Lineas).ThenInclude(l => l.IdProductoNavigation)
                .ToListAsync();

            return Ok(new
            {
                sale.IdVenta,
                sale.MontoTotal,
                Items = sale.Items.Where(i => i.IdVentaPromocion == null).Select(i => new
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
                }),
                Promociones = promocionesAplicadas.Select(SalePromotionMapper.Map)
            });
        }

        /// <summary>
        /// El vendedor modifica su propio vale pendiente (tras reescanear el ticket): reconstruye
        /// las líneas conservando el mismo número de venta. Solo si sigue pendiente de pago.
        /// </summary>
        [HttpPut("{idVenta:int}/items")]
        [Permission(Permissions.SalesCreate)]
        public async Task<IActionResult> UpdateSaleItems(int idVenta, [FromBody] SaleItemsUpdateDto dto)
        {
            if (dto == null || ((dto.Items?.Count ?? 0) == 0 && (dto.Promociones?.Count ?? 0) == 0))
                return BadRequest(new { mensaje = "La venta debe contener al menos un producto o promoción." });

            var sale = await _context.VenVentas.FirstOrDefaultAsync(v => v.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdUsuario != User.GetUserId()) return Forbid();
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "Solo puede modificar un vale pendiente de cobro." });

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var lines = await _saleLines.ReplaceLinesAsync(idVenta, dto.Items ?? [], dto.Promociones, sale.IdTurno);
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

        private Task<bool> SaleBelongsToCurrentUser(int idVenta) => _context.VenVentas
            .AnyAsync(x => x.IdVenta == idVenta && x.IdUsuario == User.GetUserId());

        private Task<bool> AreTurnsEnabledAsync() => _context.SegModulos.AsNoTracking().AnyAsync(module =>
            module.Codigo == "ventas" && module.Activo
            && (module.EsNucleo || (module.ConfiguracionOrganizacion != null
                && module.ConfiguracionOrganizacion.Habilitado)));

        private Task<bool> IsCajaEnabledAsync() => _context.SegModulos.AsNoTracking().AnyAsync(module =>
            module.Codigo == "caja" && module.Activo
            && (module.EsNucleo || (module.ConfiguracionOrganizacion != null
                && module.ConfiguracionOrganizacion.Habilitado)));
    }
}
