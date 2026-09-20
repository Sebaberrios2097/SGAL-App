using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Api.DTOs.Point;

namespace SgalApp.Api.Services
{
    /// <summary>
    /// Resultado de una operación de venta con Point. Separa el error de negocio
    /// (que el controller devuelve como 400) del resultado exitoso.
    /// </summary>
    public class PointSaleResult<T>
    {
        public string? Error { get; init; }

        public T? Value { get; init; }

        public bool EsValido => Error == null;

        public static PointSaleResult<T> Fallo(string error) => new() { Error = error };

        public static PointSaleResult<T> Ok(T value) => new() { Value = value };
    }

    public interface IPointSaleService
    {
        /// <summary>Registra la venta como pendiente y envía el monto a la terminal.</summary>
        Task<PointSaleResult<PointSaleStartResultDto>> StartAsync(PointSaleStartDto dto, int idUsuario, CancellationToken cancellationToken = default);

        /// <summary>
        /// Aplica a la venta el desenlace informado por Mercado Pago. Es idempotente:
        /// recibir dos veces el mismo estado no vuelve a modificar la venta.
        /// </summary>
        Task HandleOrderUpdateAsync(PointOrder order, CancellationToken cancellationToken = default);

        /// <summary>
        /// Consulta el estado en Mercado Pago y lo aplica localmente. Permite operar
        /// mientras no haya una URL pública configurada para los webhooks.
        /// </summary>
        Task<PointSaleResult<PointSaleStatusDto>> SyncAsync(int idVenta, CancellationToken cancellationToken = default);
    }

    public class PointSaleService : IPointSaleService
    {
        private readonly SgalContext _context;
        private readonly IPointService _pointService;
        private readonly ISaleLinesService _saleLines;
        private readonly MercadoPagoPointOptions _options;
        private readonly ILogger<PointSaleService> _logger;

        public PointSaleService(
            SgalContext context,
            IPointService pointService,
            ISaleLinesService saleLines,
            IOptions<MercadoPagoPointOptions> options,
            ILogger<PointSaleService> logger)
        {
            _context = context;
            _pointService = pointService;
            _saleLines = saleLines;
            _options = options.Value;
            _logger = logger;
        }

        public async Task<PointSaleResult<PointSaleStartResultDto>> StartAsync(PointSaleStartDto dto, int idUsuario, CancellationToken cancellationToken = default)
        {
            if (dto.Items == null || dto.Items.Count == 0)
            {
                return PointSaleResult<PointSaleStartResultDto>.Fallo("La venta debe contener al menos un producto.");
            }

            // La interfaz solo solicita "Tarjeta". Mercado Pago informará si el cobro
            // se procesó como débito o crédito cuando termine la operación.
            int montoTarjeta = dto.MontoTarjeta;

            if (montoTarjeta <= 0)
            {
                return PointSaleResult<PointSaleStartResultDto>.Fallo("La venta no incluye un monto a cobrar con tarjeta.");
            }

            if (dto.MetodosPago?.Any(m => m.IdMetodoPago is MetodosPago.Debito or MetodosPago.Credito) == true)
            {
                return PointSaleResult<PointSaleStartResultDto>.Fallo(
                    "No se debe indicar débito o crédito. Envía el monto mediante MontoTarjeta.");
            }

            var turnsEnabled = await _context.SegModulos.AsNoTracking().AnyAsync(module =>
                module.Codigo == "turnos" && module.Activo
                && (module.EsNucleo || (module.ConfiguracionOrganizacion != null
                    && module.ConfiguracionOrganizacion.Habilitado)), cancellationToken);
            TurTurno? turn = null;
            if (turnsEnabled)
            {
                if (!dto.IdTurno.HasValue)
                    return PointSaleResult<PointSaleStartResultDto>.Fallo("Debe iniciar un turno antes de realizar ventas.");
                turn = await _context.TurTurno.FindAsync([dto.IdTurno.Value], cancellationToken);
                if (turn == null || turn.IdEstadoTurno != 1 || turn.IdUsuario != idUsuario)
                    return PointSaleResult<PointSaleStartResultDto>.Fallo("El turno especificado no existe, no está abierto o pertenece a otro usuario.");
            }
            var idTurno = turnsEnabled ? dto.IdTurno : null;

            using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

            var sale = new VenVentas
            {
                IdTurno = idTurno,
                IdUsuario = idUsuario,
                IdEstadoVenta = EstadosVenta.PendienteDePago,
                FechaVenta = DateTime.Now,
                MontoTotal = 0,
                MontoNeto = 0,
                MontoIva = 0
            };

            _context.VenVentas.Add(sale);
            await _context.SaveChangesAsync(cancellationToken); // Generates IdVenta

            var lines = await _saleLines.BuildAsync(sale.IdVenta, dto.Items, idTurno, cancellationToken);
            if (!lines.EsValido)
            {
                await transaction.RollbackAsync(cancellationToken);
                return PointSaleResult<PointSaleStartResultDto>.Fallo(lines.Error!);
            }

            // Descuento opcional (el % ya fue validado en el controlador contra el máximo del usuario).
            int totalBruto = lines.Total;
            int montoDescuento = dto.PorcentajeDescuento != 0
                ? (int)Math.Round(totalBruto * dto.PorcentajeDescuento / 100m, MidpointRounding.AwayFromZero)
                : 0;
            int totalConDescuento = totalBruto - montoDescuento;

            int sumPayments = (dto.MetodosPago?.Sum(m => m.Monto) ?? 0) + montoTarjeta;
            if (sumPayments != totalConDescuento)
            {
                await transaction.RollbackAsync(cancellationToken);
                return PointSaleResult<PointSaleStartResultDto>.Fallo(
                    $"La suma de los métodos de pago (${sumPayments:N0}) debe ser igual al total de la venta (${totalConDescuento:N0}).");
            }

            int neto = (int)Math.Round(totalConDescuento / 1.19);
            sale.MontoTotal = totalConDescuento;
            sale.MontoNeto = neto;
            sale.MontoIva = totalConDescuento - neto;
            sale.PorcentajeDescuento = dto.PorcentajeDescuento;
            sale.MontoDescuento = montoDescuento;
            _context.Entry(sale).State = EntityState.Modified;

            // Los métodos no asociados a la terminal se pueden guardar desde ya. La porción
            // de tarjeta se registra como débito o crédito cuando Mercado Pago la informe.
            foreach (var p in (dto.MetodosPago ?? []).Where(p => p.Monto > 0))
            {
                _context.VenMetodosPagoVenta.Add(new VenMetodosPagoVenta
                {
                    IdVenta = sale.IdVenta,
                    IdMetodoPago = p.IdMetodoPago,
                    Monto = p.Monto
                });
            }

            await _context.SaveChangesAsync(cancellationToken);

            var referenciaExterna = $"SV{sale.IdVenta}_{DateTime.Now:yyyyMMddHHmmss}";
            var terminalId = _options.TerminalId;

            PointOrder order;
            try
            {
                order = await _pointService.CreateOrderAsync(new PointOrderCreateDto
                {
                    Monto = montoTarjeta,
                    ReferenciaExterna = referenciaExterna,
                    Descripcion = dto.Descripcion ?? $"Venta {sale.IdVenta}"
                }, cancellationToken);
            }
            catch (Exception ex)
            {
                // Si la terminal no acepta la orden, la venta no debe quedar registrada.
                await transaction.RollbackAsync(cancellationToken);
                _logger.LogError(ex, "No se pudo crear la orden Point para la venta {IdVenta}.", sale.IdVenta);

                return PointSaleResult<PointSaleStartResultDto>.Fallo(
                    ex is PointApiException pex && pex.ResponseBody != null
                        ? $"La terminal rechazó el cobro: {pex.ResponseBody}"
                        : "No se pudo enviar el cobro a la terminal.");
            }

            _context.VenOrdenesPoint.Add(new VenOrdenesPoint
            {
                IdOrdenMp = order.Id,
                ReferenciaExterna = referenciaExterna,
                IdVenta = sale.IdVenta,
                IdTerminal = order.Config?.Point?.TerminalId ?? terminalId,
                Monto = montoTarjeta,
                Estado = order.Status ?? "created",
                DetalleEstado = order.StatusDetail,
                IdPagoMp = order.Transactions?.Payments?.FirstOrDefault()?.Id,
                FechaCreacion = DateTime.Now,
                FechaActualizacion = DateTime.Now
            });

            try
            {
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);

                // La orden ya está en la terminal pero la venta no se guardó: hay que retirarla.
                _logger.LogError(ex, "Falló el commit de la venta {IdVenta}. Se intenta cancelar la orden {OrderId}.", sale.IdVenta, order.Id);
                try
                {
                    await _pointService.CancelOrderAsync(order.Id, cancellationToken);
                }
                catch (Exception cancelEx)
                {
                    _logger.LogError(cancelEx,
                        "No se pudo cancelar la orden {OrderId} tras el fallo. Requiere cancelación manual en la terminal.", order.Id);
                }

                return PointSaleResult<PointSaleStartResultDto>.Fallo("No se pudo registrar la venta. El cobro fue retirado de la terminal.");
            }

            bool usesVirtualTerminal = _options.TerminalId.EndsWith("__SBX0000001", StringComparison.OrdinalIgnoreCase);
            if (_options.AllowSimulation && _options.AutoSimulate && usesVirtualTerminal)
            {
                try
                {
                    var simulation = BuildRandomSimulation();
                    await _pointService.SimulateOrderAsync(order.Id, simulation, cancellationToken);

                    _logger.LogInformation(
                        "Simulación automática enviada para la orden {OrderId}. Resultado={Status} Medio={PaymentMethodType}",
                        order.Id, simulation.Status, simulation.PaymentMethodType);
                }
                catch (Exception ex)
                {
                    // La venta y la orden ya existen. Si Mercado Pago no acepta la
                    // simulación, se mantienen pendientes para permitir reintentarla.
                    _logger.LogError(ex, "No se pudo simular automáticamente la orden {OrderId}.", order.Id);
                }
            }

            return PointSaleResult<PointSaleStartResultDto>.Ok(new PointSaleStartResultDto
            {
                IdVenta = sale.IdVenta,
                IdOrden = order.Id,
                ReferenciaExterna = referenciaExterna,
                Estado = order.Status,
                MontoTotal = lines.Total,
                MontoTarjeta = montoTarjeta
            });
        }

        public async Task HandleOrderUpdateAsync(PointOrder order, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(order.Id))
            {
                return;
            }

            var registro = await _context.VenOrdenesPoint
                .FirstOrDefaultAsync(o => o.IdOrdenMp == order.Id, cancellationToken);

            if (registro == null)
            {
                _logger.LogWarning("Se recibió el estado de la orden {OrderId}, que no está registrada en el sistema.", order.Id);
                return;
            }

            var payment = order.Transactions?.Payments?.FirstOrDefault();
            var estado = order.Status ?? registro.Estado;

            registro.Estado = estado;
            registro.DetalleEstado = order.StatusDetail;
            registro.IdPagoMp = payment?.Id ?? registro.IdPagoMp;
            registro.TipoMedioPago = payment?.PaymentMethod?.Type ?? registro.TipoMedioPago;
            registro.MarcaTarjeta = payment?.PaymentMethod?.Id ?? registro.MarcaTarjeta;
            registro.Cuotas = payment?.PaymentMethod?.Installments ?? registro.Cuotas;
            registro.MontoPagado = ParseMonto(payment?.PaidAmount ?? order.TotalPaidAmount) ?? registro.MontoPagado;
            registro.MontoPropina = ParseMonto(payment?.TipAmount) ?? registro.MontoPropina;
            registro.FechaActualizacion = DateTime.Now;

            if (registro.IdVenta.HasValue)
            {
                var venta = await _context.VenVentas.FindAsync([registro.IdVenta.Value], cancellationToken);

                // Solo se actúa sobre ventas pendientes: así el reproceso de un webhook no altera nada.
                if (venta != null && venta.IdEstadoVenta == EstadosVenta.PendienteDePago)
                {
                    switch (estado)
                    {
                        case "processed":
                            var idMetodoPago = payment?.PaymentMethod?.Type switch
                            {
                                "debit_card" => MetodosPago.Debito,
                                "credit_card" => MetodosPago.Credito,
                                _ => (int?)null
                            };

                            if (!idMetodoPago.HasValue)
                            {
                                _logger.LogWarning(
                                    "La orden {OrderId} fue procesada sin un tipo de tarjeta reconocible ({TipoMedioPago}). La venta {IdVenta} seguirá pendiente.",
                                    order.Id, payment?.PaymentMethod?.Type, venta.IdVenta);
                                break;
                            }

                            // Compatibilidad con órdenes iniciadas por versiones anteriores:
                            // cualquier asignación provisoria de débito/crédito se reemplaza
                            // por la clasificación que informó Mercado Pago.
                            var asignacionesTarjeta = await _context.VenMetodosPagoVenta
                                .Where(m => m.IdVenta == venta.IdVenta &&
                                            (m.IdMetodoPago == MetodosPago.Debito || m.IdMetodoPago == MetodosPago.Credito))
                                .ToListAsync(cancellationToken);

                            if (asignacionesTarjeta.Count > 0)
                            {
                                _context.VenMetodosPagoVenta.RemoveRange(asignacionesTarjeta);
                            }

                            _context.VenMetodosPagoVenta.Add(new VenMetodosPagoVenta
                            {
                                IdVenta = venta.IdVenta,
                                IdMetodoPago = idMetodoPago.Value,
                                Monto = registro.Monto
                            });

                            venta.IdEstadoVenta = EstadosVenta.Terminada;
                            _logger.LogInformation("Venta {IdVenta} confirmada por la orden {OrderId}.", venta.IdVenta, order.Id);
                            break;

                        case "canceled":
                        case "failed":
                        case "expired":
                            venta.IdEstadoVenta = EstadosVenta.Cancelada;
                            await _saleLines.RestoreStockAsync(venta.IdVenta, cancellationToken);
                            _logger.LogInformation("Venta {IdVenta} cancelada ({Estado}). Se devolvió el stock.", venta.IdVenta, estado);
                            break;
                    }

                    if (venta.IdEstadoVenta != EstadosVenta.PendienteDePago)
                    {
                        _context.Entry(venta).State = EntityState.Modified;
                    }
                }
                else if (venta != null && estado == "refunded")
                {
                    // El reembolso llega sobre una venta ya terminada: se anula sin tocar el stock,
                    // porque el producto normalmente ya fue entregado.
                    venta.IdEstadoVenta = EstadosVenta.Anulada;
                    _context.Entry(venta).State = EntityState.Modified;
                    _logger.LogInformation("Venta {IdVenta} anulada por reembolso de la orden {OrderId}.", venta.IdVenta, order.Id);
                }
            }

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<PointSaleResult<PointSaleStatusDto>> SyncAsync(int idVenta, CancellationToken cancellationToken = default)
        {
            var registro = await _context.VenOrdenesPoint
                .Where(o => o.IdVenta == idVenta)
                .OrderByDescending(o => o.IdOrdenPoint)
                .FirstOrDefaultAsync(cancellationToken);

            if (registro == null)
            {
                return PointSaleResult<PointSaleStatusDto>.Fallo($"La venta {idVenta} no tiene una orden de Point asociada.");
            }

            try
            {
                var order = await _pointService.GetOrderAsync(registro.IdOrdenMp, cancellationToken);
                await HandleOrderUpdateAsync(order, cancellationToken);
            }
            catch (PointApiException ex)
            {
                _logger.LogError(ex, "No se pudo consultar la orden {OrderId} en Mercado Pago.", registro.IdOrdenMp);
                return PointSaleResult<PointSaleStatusDto>.Fallo("No se pudo consultar el estado del cobro en Mercado Pago.");
            }

            var venta = await _context.VenVentas
                .Include(v => v.IdEstadoVentaNavigation)
                .FirstOrDefaultAsync(v => v.IdVenta == idVenta, cancellationToken);

            return PointSaleResult<PointSaleStatusDto>.Ok(new PointSaleStatusDto
            {
                IdVenta = idVenta,
                IdEstadoVenta = venta?.IdEstadoVenta ?? 0,
                EstadoVenta = venta?.IdEstadoVentaNavigation?.NombreEstadoVenta,
                IdOrden = registro.IdOrdenMp,
                EstadoOrden = registro.Estado,
                DetalleEstadoOrden = registro.DetalleEstado,
                MontoPagado = registro.MontoPagado,
                TipoMedioPago = registro.TipoMedioPago,
                MarcaTarjeta = registro.MarcaTarjeta,
                Cuotas = registro.Cuotas
            });
        }

        private static int? ParseMonto(string? amount) =>
            decimal.TryParse(amount, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var value)
                ? (int)Math.Round(value)
                : null;

        private static PointSimulationRequest BuildRandomSimulation()
        {
            var outcome = Random.Shared.Next(100);

            if (outcome >= 95)
            {
                return new PointSimulationRequest { Status = "canceled" };
            }

            bool esCredito = Random.Shared.Next(2) == 0;
            var simulation = new PointSimulationRequest
            {
                Status = outcome < 80 ? "processed" : "failed",
                PaymentMethodType = esCredito ? "credit_card" : "debit_card",
                PaymentMethodId = esCredito ? "visa" : "debvisa",
                StatusDetail = outcome < 80 ? "accredited" : "insufficient_amount"
            };

            if (esCredito)
            {
                simulation.Installments = 1;
            }

            return simulation;
        }
    }
}
