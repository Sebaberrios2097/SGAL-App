using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;

namespace SgalApp.Api.Services
{
    /// <summary>Identificadores del catálogo Ven_Estados_Ventas.</summary>
    public static class EstadosVenta
    {
        public const int Terminada = 1;
        public const int Cancelada = 2;
        public const int Anulada = 3;
        public const int PendienteDePago = 4;
    }

    /// <summary>Identificadores del catálogo Ven_Metodos_Pago.</summary>
    public static class MetodosPago
    {
        public const int Efectivo = 1;
        public const int Debito = 2;
        public const int Credito = 3;
        public const int Transferencia = 4;
    }

    public class SaleLinesResult
    {
        public string? Error { get; init; }

        /// <summary>Total a cobrar (en consumos de empleado, excluye las líneas de cortesía).</summary>
        public int Total { get; init; }

        /// <summary>Valor de las líneas marcadas como cortesía (informativo; no se cobra).</summary>
        public int MontoCortesia { get; init; }

        public bool EsValido => Error == null;
    }

    /// <summary>
    /// Arma el detalle de una venta: valida productos, descuenta stock, aplica descuentos
    /// vigentes y calcula el total. Lo comparten la venta directa y la venta con Point.
    /// </summary>
    public interface ISaleLinesService
    {
        Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, int idTurno, CancellationToken cancellationToken = default);

        /// <summary>
        /// Igual que <see cref="BuildAsync(int, IEnumerable{SaleItemDto}, int, CancellationToken)"/> pero,
        /// para consumos de empleado, marca automáticamente como cortesía las líneas elegibles según los
        /// cupos diarios (global y por producto) del usuario, excluyéndolas del total a cobrar.
        /// </summary>
        Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, int idTurno, bool aplicarCortesia, int idUsuario, CancellationToken cancellationToken = default);

        Task RestoreStockAsync(int idVenta, CancellationToken cancellationToken = default);
    }

    public class SaleLinesService : ISaleLinesService
    {
        private readonly SgalContext _context;

        public SaleLinesService(SgalContext context)
        {
            _context = context;
        }

        public Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, int idTurno, CancellationToken cancellationToken = default)
            => BuildAsync(idVenta, items, idTurno, false, 0, cancellationToken);

        public async Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, int idTurno, bool aplicarCortesia, int idUsuario, CancellationToken cancellationToken = default)
        {
            int total = 0;
            int montoCortesia = 0;

            // Cupos de cortesía del usuario para hoy (solo para consumos de empleado). Se marca la
            // línea completa como cortesía si su cantidad cabe en el cupo global y en el del producto.
            var cortesiaProductos = new Dictionary<int, int>();   // idProducto -> límite diario del producto
            int cortesiaRestanteGlobal = 0;
            var cortesiaRestantePorProducto = new Dictionary<int, int>(); // idProducto -> restante hoy
            if (aplicarCortesia)
            {
                var dayStart = DateTime.Today;
                var dayEnd = dayStart.AddDays(1);
                var limiteGlobal = await _context.InvConfiguracionCortesia
                    .Where(x => x.IdConfiguracion == 1)
                    .Select(x => (int?)x.LimiteDiarioGlobal).FirstOrDefaultAsync(cancellationToken) ?? 2;
                cortesiaProductos = await _context.InvProductosCortesia.AsNoTracking()
                    .Where(x => x.Activo == 1 && x.IdProductoNavigation.Activo)
                    .ToDictionaryAsync(x => x.IdProducto, x => x.CantidadDiaria, cancellationToken);
                // Cortesías ya consumidas hoy por el usuario (líneas de cortesía de ventas de consumo).
                var consumidasHoy = await _context.VenDetalleVenta.AsNoTracking()
                    .Where(d => d.EsCortesia
                        && d.IdVentaNavigation.IdBitacora != null
                        && d.IdVentaNavigation.IdTurnoNavigation.IdUsuario == idUsuario
                        && d.IdVentaNavigation.FechaVenta >= dayStart && d.IdVentaNavigation.FechaVenta < dayEnd)
                    .GroupBy(d => d.IdProducto)
                    .Select(g => new { IdProducto = g.Key, Cantidad = g.Sum(x => x.Cantidad) })
                    .ToListAsync(cancellationToken);
                var totalConsumidasHoy = consumidasHoy.Sum(x => x.Cantidad);
                cortesiaRestanteGlobal = Math.Max(0, limiteGlobal - totalConsumidasHoy);
                foreach (var kv in cortesiaProductos)
                {
                    var usadas = consumidasHoy.FirstOrDefault(x => x.IdProducto == kv.Key)?.Cantidad ?? 0;
                    cortesiaRestantePorProducto[kv.Key] = Math.Max(0, kv.Value - usadas);
                }
            }

            // Los gramos del café por calibración salen de la última extracción del turno
            // abierto. Se consulta una sola vez y de forma perezosa: solo si alguna receta usa
            // una materia prima calibrable. Null = el turno todavía no tiene ninguna extracción.
            double? gramosCalibracion = null;
            bool gramosCalibracionCargados = false;
            async Task<double?> ObtenerGramosCalibracionAsync()
            {
                if (!gramosCalibracionCargados)
                {
                    gramosCalibracion = await _context.TurExtracciones
                        .Where(e => e.IdBitacoraNavigation.IdTurno == idTurno)
                        .OrderByDescending(e => e.IdExtraccion)
                        .Select(e => (double?)e.Gramos)
                        .FirstOrDefaultAsync(cancellationToken);
                    gramosCalibracionCargados = true;
                }
                return gramosCalibracion;
            }

            foreach (var item in items)
            {
                if (item.Cantidad <= 0)
                {
                    return new SaleLinesResult { Error = "La cantidad de cada producto debe ser mayor que cero." };
                }

                var prod = await _context.InvProductos
                    .FirstOrDefaultAsync(x => x.IdProducto == item.IdProducto, cancellationToken);
                if (prod == null || !prod.Activo)
                {
                    return new SaleLinesResult { Error = $"El producto con ID {item.IdProducto} no existe o no está activo." };
                }

                var detail = new VenDetalleVenta
                {
                    IdVenta = idVenta,
                    IdProducto = prod.IdProducto,
                    Cantidad = item.Cantidad,
                    PrecioNormal = prod.Precio,
                    IndExento = false
                };

                int recargoUnitario = 0;
                var materialesAConsumir = new List<(InvMaterialesReceta Material, InvMaterialesReceta Medida, bool EsEleccionAlternativa)>();

                // Los productos con receta descuentan materias primas convertidas a la
                // unidad de inventario. El snapshot permite reponer exactamente al anular.
                if (prod.RequiereReceta == true)
                {
                    // Cada producto con receta tiene la suya propia e independiente.
                    var receta = await CargarRecetaActivaAsync(prod.IdProducto, cancellationToken);
                    if (receta == null || receta.InvMaterialesReceta.Count == 0)
                        return new SaleLinesResult { Error = $"El producto {prod.NombreProducto} no tiene una receta activa configurada." };
                    var materialesReceta = receta.InvMaterialesReceta.ToList();

                    var gruposAlternativas = materialesReceta
                        .Where(m => m.IdMateriaPrimaReemplazada.HasValue)
                        .GroupBy(m => m.IdMateriaPrimaReemplazada!.Value)
                        .ToDictionary(g => g.Key, g => g.ToList());
                    var selecciones = item.SeleccionesMateriales ?? [];

                    if (selecciones.GroupBy(s => s.IdMateriaPrimaBase).Any(g => g.Count() > 1))
                        return new SaleLinesResult { Error = $"Hay selecciones de materia prima repetidas para {prod.NombreProducto}." };
                    if (selecciones.Any(s => !gruposAlternativas.ContainsKey(s.IdMateriaPrimaBase)))
                        return new SaleLinesResult { Error = $"Se indicó una alternativa que no pertenece a la receta de {prod.NombreProducto}." };

                    var seleccionPorBase = selecciones.ToDictionary(s => s.IdMateriaPrimaBase);

                    foreach (var materialBase in materialesReceta.Where(m => !m.IdMateriaPrimaReemplazada.HasValue))
                    {
                        if (!gruposAlternativas.TryGetValue(materialBase.IdMateriaPrima, out var alternativas))
                        {
                            materialesAConsumir.Add((materialBase, materialBase, false));
                            continue;
                        }

                        int idSeleccionado = seleccionPorBase.TryGetValue(materialBase.IdMateriaPrima, out var seleccion)
                            ? seleccion.IdMateriaPrimaSeleccionada
                            : materialBase.IdMateriaPrima;
                        var materialSeleccionado = idSeleccionado == materialBase.IdMateriaPrima
                            ? materialBase
                            : alternativas.FirstOrDefault(m => m.IdMateriaPrima == idSeleccionado);

                        if (materialSeleccionado == null)
                            return new SaleLinesResult { Error = $"La materia prima seleccionada no es una alternativa válida para {prod.NombreProducto}." };

                        var medidaSeleccionada = materialSeleccionado.UsaMismaMedidaQuePrincipal
                            ? materialBase
                            : materialSeleccionado;
                        materialesAConsumir.Add((materialSeleccionado, medidaSeleccionada, true));
                        recargoUnitario += materialSeleccionado.Recargo;
                    }

                    if (gruposAlternativas.Keys.Any(id => materialesAConsumir.All(x => x.Material.IdMateriaPrima != id && x.Material.IdMateriaPrimaReemplazada != id)))
                        return new SaleLinesResult { Error = $"La receta de {prod.NombreProducto} contiene una alternativa sin materia principal." };

                    foreach (var (material, medida, esEleccionAlternativa) in materialesAConsumir)
                    {
                        // Materia prima no controlada en inventario (p. ej. agua): no valida ni
                        // descuenta stock y no se registra su consumo. La receta puede incluirla
                        // solo como referencia.
                        if (material.IdMateriaPrimaNavigation.NoDescuentaInventario)
                            continue;

                        // Café por calibración: la cantidad no es la fija de la receta (en gramos),
                        // sino los gramos de la última extracción del turno. Sin extracción se
                        // bloquea la venta. La receta obliga a configurar el café en gramos, por lo
                        // que la conversión a la unidad de stock sigue siendo la misma.
                        decimal cantidadReceta;
                        if (material.IdMateriaPrimaNavigation.EsCafeCalibrable)
                        {
                            var gramos = await ObtenerGramosCalibracionAsync();
                            if (gramos is not > 0)
                                return new SaleLinesResult { Error = $"Registre una calibración (extracción) en la bitácora del turno antes de vender {prod.NombreProducto}." };
                            cantidadReceta = (decimal)gramos.Value;
                        }
                        else
                        {
                            cantidadReceta = medida.CantidadRequerida;
                        }

                        var required = decimal.Round(
                            cantidadReceta * item.Cantidad
                            * medida.IdUnidadMedidaNavigation.FactorConversionBase
                            / material.IdMateriaPrimaNavigation.IdUnidadMedidaNavigation.FactorConversionBase,
                            3,
                            MidpointRounding.AwayFromZero);
                        if (required <= 0)
                            return new SaleLinesResult { Error = $"La cantidad configurada para {material.IdMateriaPrimaNavigation.NombreMaterial} es demasiado pequeña." };
                        if (material.IdMateriaPrimaNavigation.Cantidad < required)
                            return new SaleLinesResult { Error = $"Stock insuficiente de {material.IdMateriaPrimaNavigation.NombreMaterial}. Se requieren {required} {material.IdMateriaPrimaNavigation.IdUnidadMedidaNavigation.Abreviacion}." };

                        material.IdMateriaPrimaNavigation.Cantidad -= required;
                        detail.VenDetalleVentaMateriales.Add(new VenDetalleVentaMateriales
                        {
                            IdMateriaPrima = material.IdMateriaPrima,
                            CantidadDescontada = required,
                            EsEleccionAlternativa = esEleccionAlternativa,
                            Recargo = esEleccionAlternativa ? material.Recargo : 0
                        });
                    }
                }
                else if (prod.Stock.HasValue)
                {
                    if (prod.Stock.Value < item.Cantidad)
                    {
                        return new SaleLinesResult { Error = $"Stock insuficiente para el producto: {prod.NombreProducto}. Stock disponible: {prod.Stock.Value}." };
                    }
                    prod.Stock -= item.Cantidad;
                    _context.Entry(prod).State = EntityState.Modified;
                }

                // Ingredientes extra: cada uno descuenta su materia prima y suma su precio
                // como recargo por unidad. El consumo se guarda junto al resto de materiales
                // para que la anulación reponga stock sin lógica adicional.
                var idsExtra = (item.IdsIngredientesExtra ?? [])
                    .Where(x => x > 0)
                    .Distinct()
                    .ToList();
                if (idsExtra.Count > 0)
                {
                    if (!prod.AceptaIngredientesExtra)
                        return new SaleLinesResult { Error = $"El producto {prod.NombreProducto} no admite ingredientes extra." };

                    // Los extras son materias primas marcadas con "Uso para ingrediente extra".
                    var extras = await _context.InvMateriaPrima
                        .Include(m => m.IdUnidadMedidaNavigation)
                        .Include(m => m.IdUnidadIngredienteExtraNavigation)
                        .Where(m => idsExtra.Contains(m.IdMateriaPrima))
                        .ToListAsync(cancellationToken);

                    foreach (var idExtra in idsExtra)
                    {
                        var extra = extras.FirstOrDefault(m => m.IdMateriaPrima == idExtra);
                        if (extra == null || !extra.UsoIngredienteExtra
                            || extra.PrecioIngredienteExtra == null
                            || extra.IdUnidadIngredienteExtraNavigation == null)
                            return new SaleLinesResult { Error = $"El ingrediente extra seleccionado para {prod.NombreProducto} no existe o no está activo." };

                        // La materia prima marcada como no-descontable (p. ej. agua) no valida ni
                        // descuenta stock (su cantidad es referencial); el recargo se aplica igual.
                        if (!extra.NoDescuentaInventario)
                        {
                            if (extra.CantidadIngredienteExtra == null)
                                return new SaleLinesResult { Error = $"El ingrediente extra {extra.NombreMaterial} no tiene una cantidad configurada." };
                            var requiredExtra = decimal.Round(
                                extra.CantidadIngredienteExtra.Value * item.Cantidad
                                * extra.IdUnidadIngredienteExtraNavigation.FactorConversionBase
                                / extra.IdUnidadMedidaNavigation.FactorConversionBase,
                                3,
                                MidpointRounding.AwayFromZero);
                            if (requiredExtra <= 0)
                                return new SaleLinesResult { Error = $"La cantidad configurada para el extra {extra.NombreMaterial} es demasiado pequeña." };
                            if (extra.Cantidad < requiredExtra)
                                return new SaleLinesResult { Error = $"Stock insuficiente de {extra.NombreMaterial} para el extra. Se requieren {requiredExtra} {extra.IdUnidadMedidaNavigation.Abreviacion}." };

                            extra.Cantidad -= requiredExtra;
                            detail.VenDetalleVentaMateriales.Add(new VenDetalleVentaMateriales
                            {
                                IdMateriaPrima = extra.IdMateriaPrima,
                                CantidadDescontada = requiredExtra,
                                EsEleccionAlternativa = false,
                                Recargo = 0
                            });
                        }
                        detail.VenDetalleVentaIngrediente.Add(new VenDetalleVentaIngrediente
                        {
                            IdMateriaPrima = extra.IdMateriaPrima,
                            Precio = extra.PrecioIngredienteExtra.Value
                        });
                        recargoUnitario += extra.PrecioIngredienteExtra.Value;
                    }
                }

                // Check for active discounts on this product
                int finalUnitPrice = prod.Precio;
                var activeDiscount = await _context.InvDescuentosProductos
                    .FirstOrDefaultAsync(d => d.IdProducto == prod.IdProducto && d.Activo &&
                                              DateTime.Now >= d.FechaInicioDescuento &&
                                              (!d.FechaTerminoDescuento.HasValue || DateTime.Now <= d.FechaTerminoDescuento.Value),
                                         cancellationToken);

                if (activeDiscount != null)
                {
                    decimal discountVal = (prod.Precio * activeDiscount.PorcentajeDescuento) / 100m;
                    finalUnitPrice = (int)Math.Round(prod.Precio - discountVal);
                }

                finalUnitPrice += recargoUnitario;

                int subtotal = finalUnitPrice * item.Cantidad;

                // Cortesía automática (consumos de empleado): la línea completa es cortesía si el
                // producto está habilitado y su cantidad cabe en el cupo global y en el del producto.
                bool esCortesiaLinea = false;
                if (aplicarCortesia
                    && cortesiaProductos.ContainsKey(prod.IdProducto)
                    && item.Cantidad <= cortesiaRestanteGlobal
                    && item.Cantidad <= cortesiaRestantePorProducto.GetValueOrDefault(prod.IdProducto, 0))
                {
                    esCortesiaLinea = true;
                    cortesiaRestanteGlobal -= item.Cantidad;
                    cortesiaRestantePorProducto[prod.IdProducto] -= item.Cantidad;
                    montoCortesia += subtotal;
                }
                else
                {
                    total += subtotal;
                }

                detail.EsCortesia = esCortesiaLinea;
                detail.PrecioNormal = prod.Precio + recargoUnitario;
                detail.PrecioUnitario = finalUnitPrice;
                detail.Subtotal = subtotal;

                _context.VenDetalleVenta.Add(detail);
            }

            return new SaleLinesResult { Total = total, MontoCortesia = montoCortesia };
        }

        /// <summary>
        /// Carga la receta activa de un producto con las navegaciones necesarias para descontar
        /// stock (materia prima + unidades). Se trackea porque luego se muta la cantidad en stock.
        /// </summary>
        private Task<InvRecetas?> CargarRecetaActivaAsync(int idProducto, CancellationToken cancellationToken)
        {
            return _context.InvRecetas
                .Include(r => r.InvMaterialesReceta).ThenInclude(m => m.IdUnidadMedidaNavigation)
                .Include(r => r.InvMaterialesReceta).ThenInclude(m => m.IdMateriaPrimaNavigation).ThenInclude(mp => mp.IdUnidadMedidaNavigation)
                .FirstOrDefaultAsync(r => r.IdProducto == idProducto && r.Estado, cancellationToken);
        }

        /// <summary>
        /// Devuelve al inventario el stock de una venta que no llegó a concretarse.
        /// </summary>
        public async Task RestoreStockAsync(int idVenta, CancellationToken cancellationToken = default)
        {
            var detalles = await _context.VenDetalleVenta
                .Include(d => d.VenDetalleVentaMateriales)
                    .ThenInclude(m => m.IdMateriaPrimaNavigation)
                .Where(d => d.IdVenta == idVenta)
                .ToListAsync(cancellationToken);

            foreach (var detalle in detalles)
            {
                // Repone la materia prima consumida por la receta y por los ingredientes extra.
                foreach (var material in detalle.VenDetalleVentaMateriales)
                    material.IdMateriaPrimaNavigation.Cantidad += material.CantidadDescontada;

                // Repone el stock de los productos controlados por unidades. Los productos con
                // receta tienen Stock nulo, así que aquí solo se ajustan los que lo usan (incluso
                // cuando llevan extras que sí registran consumo de materiales).
                var prod = await _context.InvProductos.FindAsync([detalle.IdProducto], cancellationToken);
                if (prod?.Stock != null)
                {
                    prod.Stock += detalle.Cantidad;
                    _context.Entry(prod).State = EntityState.Modified;
                }
            }
        }
    }
}
