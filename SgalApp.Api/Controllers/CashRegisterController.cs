using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.DTOs.Point;
using SgalApp.Api.Services;
using SgalApp.Api.Services.Dte;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers
{
    /// <summary>
    /// Módulo Caja: el cajero cobra los vales (ventas PendienteDePago) generados por los
    /// vendedores. El cobro atribuye el dinero al turno transversal del cajero (Id_Turno_Caja)
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
        private readonly IDteService _dte;
        private readonly ILogger<CashRegisterController> _logger;

        public CashRegisterController(
            SgalContext context,
            IPermissionService permissions,
            ISaleLinesService saleLines,
            IPointService pointService,
            IPointSaleService pointSales,
            IPosCredentialProvider credentials,
            IDteService dte,
            ILogger<CashRegisterController> logger)
        {
            _context = context;
            _permissions = permissions;
            _saleLines = saleLines;
            _pointService = pointService;
            _pointSales = pointSales;
            _credentials = credentials;
            _dte = dte;
            _logger = logger;
        }

        private Task<bool> IsBoletasEnabledAsync() => _context.SegModulos.AsNoTracking().AnyAsync(module =>
            module.Codigo == "boletas" && module.Activo
            && (module.EsNucleo || (module.ConfiguracionOrganizacion != null
                && module.ConfiguracionOrganizacion.Habilitado)));

        /// <summary>
        /// Emite el DTE de una venta ya cobrada. No debe romper el cobro si LibreDTE falla: el
        /// documento queda pendiente y se puede reintentar.
        /// </summary>
        private async Task TryEmitirDteAsync(int idVenta)
        {
            if (!await IsBoletasEnabledAsync()) return;
            try { await _dte.EmitirPorVentaAsync(idVenta); }
            catch (Exception ex) { _logger.LogError(ex, "No se pudo emitir el DTE de la venta {IdVenta} tras el cobro.", idVenta); }
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
                        d.IdVentaPromocion,
                        d.IdProducto,
                        d.IdProductoNavigation.NombreProducto,
                        d.Cantidad,
                        d.PrecioNormal,
                        d.PrecioUnitario,
                        d.Subtotal,
                        d.EnvasesRecibidos,
                        d.PrecioEnvase,
                        d.RecargoEnvases,
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

            var pendingIds = pending.Select(p => p.IdVenta).ToList();
            var promocionesAplicadas = await _context.VenVentaPromociones.AsNoTracking()
                .Where(p => pendingIds.Contains(p.IdVenta))
                .Include(p => p.IdPromocionNavigation).ThenInclude(p => p.Grupos).ThenInclude(g => g.Productos)
                .Include(p => p.Lineas).ThenInclude(l => l.IdProductoNavigation)
                .ToListAsync();
            var promocionesPorVenta = promocionesAplicadas
                .GroupBy(p => p.IdVenta)
                .ToDictionary(g => g.Key, g => g.Select(SalePromotionMapper.Map).ToList());

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

            // Porción del depósito de envases que el cobro exigirá pagar en efectivo. Se resuelve aquí
            // (misma regla que Collect: medio del producto ?? medio por defecto) para que la caja pueda
            // anticiparlo en pantalla sin re-resolver los defaults en el cliente.
            var returnableMethodDefault = await _context.OrgConfiguracion.AsNoTracking()
                .Where(x => x.IdConfiguracion == 1).Select(x => x.RetornablesMedioPago).FirstAsync();
            var returnableMethods = productIds.Count == 0
                ? new Dictionary<int, string?>()
                : await _context.VenProductosRetornables.AsNoTracking()
                    .Where(x => productIds.Contains(x.IdProducto))
                    .ToDictionaryAsync(x => x.IdProducto, x => x.MedioPago);
            int RequiredCashFor(int idProducto, int recargoEnvases) =>
                recargoEnvases > 0 && (returnableMethods.GetValueOrDefault(idProducto) ?? returnableMethodDefault) == "EFECTIVO"
                    ? recargoEnvases : 0;

            var result = pending.Select(p => new
            {
                p.IdVenta,
                p.FechaVenta,
                p.MontoTotal,
                p.Vendedor,
                EfectivoEnvasesObligatorio = p.Items.Sum(i => RequiredCashFor(i.IdProducto, i.RecargoEnvases)),
                Items = p.Items.Where(i => i.IdVentaPromocion == null).Select(i => new
                {
                    i.IdProducto,
                    i.NombreProducto,
                    i.Cantidad,
                    i.PrecioNormal,
                    i.PrecioUnitario,
                    i.Subtotal,
                    i.EnvasesRecibidos,
                    i.PrecioEnvase,
                    i.RecargoEnvases,
                    SeleccionesMateriales = i.Selecciones.Select(s => new
                    {
                        s.IdMateriaPrima,
                        IdMateriaPrimaBase = baseByProdAlt.TryGetValue((i.IdProducto, s.IdMateriaPrima), out var b) ? b : (int?)null,
                        s.NombreMateriaPrima,
                        s.Recargo
                    }),
                    IngredientesExtra = i.Extras
                }),
                Promociones = promocionesPorVenta.GetValueOrDefault(p.IdVenta, [])
            });

            return Ok(result);
        }

        /// <summary>Historial de ventas efectivamente cobradas por el usuario en Caja.</summary>
        [HttpGet("history")]
        [Permission(Permissions.CajaOperate + "|" + Permissions.CajaCollect)]
        public async Task<IActionResult> GetHistory()
        {
            var userId = User.GetUserId();
            var ventas = await _context.VenVentas.AsNoTracking()
                .Where(v => v.IdTurnoCaja != null
                    && v.IdTurnoCajaNavigation != null
                    && v.IdTurnoCajaNavigation.IdUsuario == userId
                    && v.IdEstadoVenta != EstadosVenta.Cancelada
                    && v.IdBitacora == null)
                .OrderByDescending(v => v.FechaVenta)
                .Take(250)
                .Select(v => new
                {
                    v.IdVenta,
                    v.FechaVenta,
                    v.MontoTotal,
                    v.IdEstadoVenta,
                    v.MotivoAnulacion,
                    v.FechaAnulacion,
                    v.IdTipoDte,
                    v.FolioDte,
                    Vendedor = v.IdUsuarioNavigation.EmpEmpleados.Where(e => e.Activo)
                        .Select(e => e.Nombres + " " + e.Apellido1).FirstOrDefault()
                        ?? v.IdUsuarioNavigation.NombreUsuario,
                    MetodosPago = v.VenMetodosPagoVenta.Select(mp => new
                    {
                        mp.IdMetodoPago,
                        mp.IdMetodoPagoNavigation.NombreMetodoPago,
                        mp.Monto
                    }),
                    Items = v.VenDetalleVenta.Where(d => d.IdVentaPromocion == null).Select(d => new
                    {
                        d.IdProductoNavigation.NombreProducto,
                        d.Cantidad,
                        d.PrecioNormal,
                        d.PrecioUnitario,
                        d.Subtotal,
                        d.EnvasesRecibidos,
                        d.PrecioEnvase,
                        d.RecargoEnvases,
                        SeleccionesMateriales = d.VenDetalleVentaMateriales.Where(m => m.EsEleccionAlternativa)
                            .Select(m => new { NombreMateriaPrima = m.IdMateriaPrimaNavigation.NombreMaterial, m.Recargo }),
                        IngredientesExtra = d.VenDetalleVentaIngrediente
                            .Select(x => new { Nombre = x.IdMateriaPrimaNavigation.NombreMaterial, x.Precio })
                    }),
                    Promociones = v.VenVentaPromociones.Select(p => new
                    {
                        p.IdVentaPromocion,
                        p.IdPromocionNavigation.Nombre,
                        p.Cantidad,
                        p.Precio,
                        p.MontoIndividual,
                        p.Descuento,
                        Productos = p.Lineas.Select(l => new { l.IdProductoNavigation.NombreProducto, l.Cantidad })
                    })
                }).ToListAsync();
            return Ok(ventas);
        }

        /// <summary>
        /// Reemplaza las líneas de un vale pendiente (el cajero agrega o quita productos antes
        /// de cobrar). Reconstruye el detalle con la misma lógica que una venta nueva.
        /// </summary>
        [HttpPut("{idVenta:int}/items")]
        [Permission(Permissions.CajaSaleModify)]
        public async Task<IActionResult> UpdateItems(int idVenta, [FromBody] SaleItemsUpdateDto dto)
        {
            if (dto == null || ((dto.Items?.Count ?? 0) == 0 && (dto.Promociones?.Count ?? 0) == 0))
                return BadRequest(new { mensaje = "El vale debe contener al menos un producto o promoción." });

            var cajaTurn = await _context.TurTurno.AnyAsync(t =>
                t.IdEstadoTurno == 1 && t.IdUsuario == User.GetUserId());
            if (!cajaTurn)
                return BadRequest(new { mensaje = "Debe abrir un turno de caja antes de modificar un vale." });

            var sale = await _context.VenVentas.FirstOrDefaultAsync(v => v.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "Solo se pueden modificar vales pendientes de cobro." });

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

        /// <summary>
        /// El cajero crea una venta nueva desde la caja: se registra como un vale pendiente
        /// contra su turno de caja, listo para cobrarse. No requiere el permiso de ventas.
        /// </summary>
        [HttpPost("sale")]
        [Permission(Permissions.CajaSaleModify)]
        public async Task<IActionResult> CreateSale([FromBody] SaleItemsUpdateDto dto)
        {
            dto ??= new SaleItemsUpdateDto();

            var cajaTurn = await _context.TurTurno.FirstOrDefaultAsync(t =>
                t.IdEstadoTurno == 1 && t.IdUsuario == User.GetUserId());
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
                sale.CorrelativoDiario = await OperationalDayService.NextSaleSequenceAsync(_context, sale.FechaVenta);
                _context.VenVentas.Add(sale);
                await _context.SaveChangesAsync();

                var tieneLineas = (dto.Items?.Count ?? 0) > 0 || (dto.Promociones?.Count ?? 0) > 0;
                var totalBruto = 0;
                if (tieneLineas)
                {
                    var lines = await _saleLines.BuildAsync(sale.IdVenta, dto.Items ?? [], dto.Promociones, cajaTurn.IdTurno);
                    if (!lines.EsValido)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest(new { mensaje = lines.Error });
                    }
                    totalBruto = lines.Total;
                }
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

        /// <summary>Convierte un vale pendiente en consumo personal del cajero y lo asocia a su bitácora.</summary>
        [HttpPost("{idVenta:int}/consumption")]
        [Permission(Permissions.LogbookConsumptionsCreate)]
        public async Task<IActionResult> RegisterConsumption(int idVenta, [FromBody] SaleItemsUpdateDto dto)
        {
            if (dto == null || (dto.Items?.Count ?? 0) == 0)
                return BadRequest(new { mensaje = "El consumo debe contener al menos un producto." });
            if ((dto.Promociones?.Count ?? 0) > 0)
                return BadRequest(new { mensaje = "Las promociones no se aplican a consumos de personal." });

            var userId = User.GetUserId();
            var turn = await _context.TurTurno.FirstOrDefaultAsync(item =>
                item.IdEstadoTurno == 1 && item.IdUsuario == userId);
            if (turn == null)
                return BadRequest(new { mensaje = "Debe tener un turno abierto para registrar un consumo." });

            var sale = await _context.VenVentas.FirstOrDefaultAsync(item => item.IdVenta == idVenta);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "Solo se pueden registrar como consumo los vales pendientes." });

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var logbook = await _context.TurBitacora.FirstOrDefaultAsync(item => item.IdTurno == turn.IdTurno);
                if (logbook == null)
                {
                    logbook = new TurBitacora { IdTurno = turn.IdTurno, FechaCreacion = DateTime.Now };
                    _context.TurBitacora.Add(logbook);
                    await _context.SaveChangesAsync();
                }

                var lines = await _saleLines.ReplaceLinesAsConsumptionAsync(
                    sale.IdVenta, dto.Items ?? [], turn.IdTurno, userId);
                if (!lines.EsValido)
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { mensaje = lines.Error });
                }

                sale.IdTurno = turn.IdTurno;
                sale.IdUsuario = userId;
                sale.IdBitacora = logbook.IdBitacora;
                sale.IdEstadoVenta = EstadosVenta.Terminada;
                sale.IdTurnoCaja = null;
                sale.PorcentajeDescuento = 0;
                sale.MontoDescuento = 0;
                sale.MontoTotal = lines.Total;
                sale.MontoNeto = (int)Math.Round(lines.Total / 1.19);
                sale.MontoIva = lines.Total - sale.MontoNeto;
                _context.Entry(sale).State = EntityState.Modified;

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return Ok(new
                {
                    mensaje = "Consumo de personal registrado.",
                    sale.IdVenta,
                    MontoAdeudado = lines.Total,
                    lines.MontoCortesia
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { mensaje = "No fue posible registrar el consumo.", detalle = ex.Message });
            }
        }

        /// <summary>Anula un vale pendiente, conserva su historial y repone el stock.</summary>
        [HttpPost("{idVenta:int}/void")]
        [Permission(Permissions.CajaSaleVoid)]
        public async Task<IActionResult> VoidPendingSale(int idVenta, [FromBody] CashSaleVoidDto? dto,
            CancellationToken cancellationToken)
        {
            var userId = User.GetUserId();
            var turn = await _context.TurTurno.FirstOrDefaultAsync(item =>
                item.IdEstadoTurno == 1 && item.IdUsuario == userId, cancellationToken);
            if (turn == null)
                return BadRequest(new { mensaje = "Debe tener un turno abierto para anular una venta." });

            var sale = await _context.VenVentas.FirstOrDefaultAsync(item => item.IdVenta == idVenta, cancellationToken);
            if (sale == null) return NotFound(new { mensaje = "Venta no encontrada." });
            if (sale.IdEstadoVenta != EstadosVenta.PendienteDePago || sale.IdBitacora != null || sale.IdTurnoCaja != null)
                return BadRequest(new { mensaje = "Solo se pueden anular desde Caja los vales pendientes." });

            await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                await _saleLines.RestoreStockAsync(sale.IdVenta, cancellationToken);
                sale.IdEstadoVenta = EstadosVenta.Anulada;
                sale.IdTurnoCaja = turn.IdTurno;
                sale.MotivoAnulacion = string.IsNullOrWhiteSpace(dto?.Motivo) ? null : dto.Motivo.Trim();
                sale.FechaAnulacion = DateTime.Now;
                _context.Entry(sale).State = EntityState.Modified;
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return Ok(new { mensaje = "Venta anulada.", sale.IdVenta, sale.MotivoAnulacion, sale.FechaAnulacion });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);
                return StatusCode(500, new { mensaje = "No fue posible anular la venta.", detalle = ex.Message });
            }
        }

        /// <summary>Cobra un vale pendiente y lo transiciona a Terminada.</summary>
        [HttpPost("{idVenta:int}/collect")]
        [Permission(Permissions.CajaCollect)]
        public async Task<IActionResult> Collect(int idVenta, [FromBody] CashCollectDto dto)
        {
            if (dto == null) return BadRequest(new { mensaje = "Datos de cobro no válidos." });
            if (!DteDocumentSelection.IsSupported(dto.TipoDocumento))
                return BadRequest(new { mensaje = "Seleccione un tipo de documento válido." });
            var esExento = DteDocumentSelection.IsExempt(dto.TipoDocumento);
            if (esExento && !await _permissions.HasPermissionAsync(User.GetUserId(), Permissions.SalesEmitExempt))
                return StatusCode(StatusCodes.Status403Forbidden, new { mensaje = "No tiene permiso para emitir documentos exentos." });

            // El cajero debe tener un turno de caja abierto propio.
            var cajaTurn = await _context.TurTurno.FirstOrDefaultAsync(t =>
                t.IdEstadoTurno == 1 && t.IdUsuario == User.GetUserId());
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
            int totalBruto = sale.MontoTotal;

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

            var returnableDefaults = await _context.OrgConfiguracion.AsNoTracking().FirstAsync(x => x.IdConfiguracion == 1);
            var returnableMethods = await _context.VenProductosRetornables.AsNoTracking()
                .Where(x => sale.VenDetalleVenta.Select(d => d.IdProducto).Contains(x.IdProducto))
                .ToDictionaryAsync(x => x.IdProducto, x => x.MedioPago);
            var requiredContainerCash = sale.VenDetalleVenta.Where(d => d.RecargoEnvases > 0
                && (returnableMethods.GetValueOrDefault(d.IdProducto) ?? returnableDefaults.RetornablesMedioPago) == "EFECTIVO")
                .Sum(d => d.RecargoEnvases);
            if ((metodos.FirstOrDefault(x => x.IdMetodoPago == MetodosPago.Efectivo)?.Monto ?? 0) < requiredContainerCash)
                return BadRequest(new { mensaje = $"Los envases requieren al menos ${requiredContainerCash:N0} pagados en efectivo." });

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

            if (DteDocumentSelection.IsInvoice(dto.TipoDocumento))
            {
                var receptor = dto.ReceptorFactura;
                if (receptor == null || new[] { receptor.Rut, receptor.RazonSocial, receptor.Giro, receptor.Direccion, receptor.Comuna }.Any(string.IsNullOrWhiteSpace))
                    return BadRequest(new { mensaje = "Complete RUT, razón social, giro, dirección y comuna para emitir factura." });
                var cliente = await DteCustomerResolver.UpsertAsync(_context, receptor);
                sale.IdClienteEmpresa = cliente.IdClienteEmpresa;
            }
            else sale.IdClienteEmpresa = null;

            if (dto.IdCliente is > 0)
            {
                var clienteExiste = await _context.VenClientes
                    .AnyAsync(c => c.IdCliente == dto.IdCliente && !c.Anonimizado);
                if (!clienteExiste)
                    return BadRequest(new { mensaje = "El cliente seleccionado no existe." });
                sale.IdCliente = dto.IdCliente;
            }

            await _saleLines.SetExemptAsync(sale.IdVenta, esExento);

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

                // El depósito de envases es un canje reembolsable, no una venta: se excluye de la base
                // tributaria. La venta se cobra por el total (incluye envases), pero Neto/IVA se calculan
                // sobre la base sin envases. El DTE se emite igual desde las líneas (que no llevan depósito).
                int montoEnvases = sale.VenDetalleVenta.Sum(d => d.RecargoEnvases);
                int baseTributable = Math.Max(0, total - montoEnvases);
                sale.IdTurnoCaja = cajaTurn.IdTurno;
                sale.PorcentajeDescuento = porcentajeDescuento;
                sale.MontoDescuento = montoDescuento;
                sale.MontoTotal = total;
                sale.MontoNeto = esExento ? 0 : (int)Math.Round(baseTributable / 1.19);
                sale.MontoIva = esExento ? 0 : baseTributable - sale.MontoNeto;
                sale.IdEstadoVenta = EstadosVenta.Terminada;
                _context.Entry(sale).State = EntityState.Modified;

                VenValeEnvase? containerVoucher = null;
                var containerLines = sale.VenDetalleVenta.Where(d => d.RecargoEnvases > 0).ToList();
                if (containerLines.Count > 0)
                {
                    var issuedAt = DateTime.Now;
                    containerVoucher = new VenValeEnvase
                    {
                        Codigo = await ReturnableVoucherCode.NextAsync(_context), IdVenta = sale.IdVenta,
                        FechaEmision = issuedAt,
                        FechaVencimiento = returnableDefaults.RetornablesVigenciaDias.HasValue ? issuedAt.AddDays(returnableDefaults.RetornablesVigenciaDias.Value) : null,
                        MontoOriginal = containerLines.Sum(d => d.RecargoEnvases), Estado = "VIGENTE",
                        Detalles = containerLines.Select(d => new VenValeEnvaseDetalle { IdProducto = d.IdProducto,
                            Cantidad = d.Cantidad - d.EnvasesRecibidos, PrecioUnitario = d.PrecioEnvase }).ToList()
                    };
                    _context.VenValesEnvases.Add(containerVoucher);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                // Emisión del DTE fuera de la transacción del cobro: si falla, el cobro se mantiene
                // y el documento queda pendiente para reintento.
                await TryEmitirDteAsync(sale.IdVenta);

                return Ok(new
                {
                    mensaje = "Venta cobrada con éxito.",
                    idVenta = sale.IdVenta,
                    montoTotal = total,
                    montoDescuento,
                    valeEnvases = containerVoucher == null ? null : new { containerVoucher.Codigo, containerVoucher.FechaEmision,
                        containerVoucher.FechaVencimiento, containerVoucher.MontoOriginal,
                        productos = containerVoucher.Detalles.Select(d => new { d.IdProducto, d.Cantidad, d.PrecioUnitario }) }
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
            if (!DteDocumentSelection.IsSupported(dto.TipoDocumento))
                return BadRequest(new { mensaje = "Seleccione un tipo de documento válido." });
            var esExento = DteDocumentSelection.IsExempt(dto.TipoDocumento);
            if (esExento && !await _permissions.HasPermissionAsync(User.GetUserId(), Permissions.SalesEmitExempt))
                return StatusCode(StatusCodes.Status403Forbidden, new { mensaje = "No tiene permiso para emitir documentos exentos." });

            var schemaError = await PointSchemaGuard.GetConfigurationErrorAsync(_context, cancellationToken);
            if (schemaError != null)
                return BadRequest(new { mensaje = schemaError });

            var cajaAbierta = await _context.TurTurno.AnyAsync(t =>
                t.IdEstadoTurno == 1 && t.IdUsuario == User.GetUserId(), cancellationToken);
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

            int totalBruto = sale.MontoTotal;
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
            var containerDefaults = await _context.OrgConfiguracion.AsNoTracking().FirstAsync(x => x.IdConfiguracion == 1, cancellationToken);
            var containerMethods = await _context.VenProductosRetornables.AsNoTracking()
                .Where(x => sale.VenDetalleVenta.Select(d => d.IdProducto).Contains(x.IdProducto))
                .ToDictionaryAsync(x => x.IdProducto, x => x.MedioPago, cancellationToken);
            var mandatoryCash = sale.VenDetalleVenta.Where(d => d.RecargoEnvases > 0
                && (containerMethods.GetValueOrDefault(d.IdProducto) ?? containerDefaults.RetornablesMedioPago) == "EFECTIVO")
                .Sum(d => d.RecargoEnvases);
            if (dto.MontoTarjeta > total - mandatoryCash)
                return BadRequest(new { mensaje = $"Debe reservar ${mandatoryCash:N0} en efectivo para los envases retornables." });

            if (DteDocumentSelection.IsInvoice(dto.TipoDocumento))
            {
                var receptor = dto.ReceptorFactura;
                if (receptor == null || new[] { receptor.Rut, receptor.RazonSocial, receptor.Giro, receptor.Direccion, receptor.Comuna }.Any(string.IsNullOrWhiteSpace))
                    return BadRequest(new { mensaje = "Complete RUT, razón social, giro, dirección y comuna para emitir factura." });
                var cliente = await DteCustomerResolver.UpsertAsync(_context, receptor, cancellationToken);
                sale.IdClienteEmpresa = cliente.IdClienteEmpresa;
            }
            else sale.IdClienteEmpresa = null;

            if (dto.IdCliente is > 0)
            {
                var clienteExiste = await _context.VenClientes
                    .AnyAsync(c => c.IdCliente == dto.IdCliente && !c.Anonimizado, cancellationToken);
                if (!clienteExiste)
                    return BadRequest(new { mensaje = "El cliente seleccionado no existe." });
                sale.IdCliente = dto.IdCliente;
            }

            await _saleLines.SetExemptAsync(sale.IdVenta, esExento, cancellationToken);
            sale.MontoNeto = esExento ? 0 : (int)Math.Round(total / 1.19);
            sale.MontoIva = esExento ? 0 : total - sale.MontoNeto;
            await _context.SaveChangesAsync(cancellationToken);

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
                t.IdEstadoTurno == 1 && t.IdUsuario == User.GetUserId(), cancellationToken);
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
