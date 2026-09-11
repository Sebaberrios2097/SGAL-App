using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Services
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

        public int Total { get; init; }

        public bool EsValido => Error == null;
    }

    /// <summary>
    /// Arma el detalle de una venta: valida productos, descuenta stock, aplica descuentos
    /// vigentes y calcula el total. Lo comparten la venta directa y la venta con Point.
    /// </summary>
    public interface ISaleLinesService
    {
        Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, CancellationToken cancellationToken = default);

        Task RestoreStockAsync(int idVenta, CancellationToken cancellationToken = default);
    }

    public class SaleLinesService : ISaleLinesService
    {
        private readonly SieteVidasContext _context;

        public SaleLinesService(SieteVidasContext context)
        {
            _context = context;
        }

        public async Task<SaleLinesResult> BuildAsync(int idVenta, IEnumerable<SaleItemDto> items, CancellationToken cancellationToken = default)
        {
            int total = 0;

            foreach (var item in items)
            {
                if (item.Cantidad <= 0)
                {
                    return new SaleLinesResult { Error = "La cantidad de cada producto debe ser mayor que cero." };
                }

                var prod = await _context.InvProductos
                    .Include(x => x.InvRecetas.Where(r => r.Estado))
                        .ThenInclude(r => r.InvMaterialesReceta)
                            .ThenInclude(m => m.IdUnidadMedidaNavigation)
                    .Include(x => x.InvRecetas.Where(r => r.Estado))
                        .ThenInclude(r => r.InvMaterialesReceta)
                            .ThenInclude(m => m.IdMateriaPrimaNavigation)
                                .ThenInclude(m => m.IdUnidadMedidaNavigation)
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
                    var recipe = prod.InvRecetas.FirstOrDefault();
                    if (recipe == null || recipe.InvMaterialesReceta.Count == 0)
                        return new SaleLinesResult { Error = $"El producto {prod.NombreProducto} no tiene una receta activa configurada." };

                    var gruposAlternativas = recipe.InvMaterialesReceta
                        .Where(m => m.IdMateriaPrimaReemplazada.HasValue)
                        .GroupBy(m => m.IdMateriaPrimaReemplazada!.Value)
                        .ToDictionary(g => g.Key, g => g.ToList());
                    var selecciones = item.SeleccionesMateriales ?? [];

                    if (selecciones.GroupBy(s => s.IdMateriaPrimaBase).Any(g => g.Count() > 1))
                        return new SaleLinesResult { Error = $"Hay selecciones de materia prima repetidas para {prod.NombreProducto}." };
                    if (selecciones.Any(s => !gruposAlternativas.ContainsKey(s.IdMateriaPrimaBase)))
                        return new SaleLinesResult { Error = $"Se indicó una alternativa que no pertenece a la receta de {prod.NombreProducto}." };

                    var seleccionPorBase = selecciones.ToDictionary(s => s.IdMateriaPrimaBase);

                    foreach (var materialBase in recipe.InvMaterialesReceta.Where(m => !m.IdMateriaPrimaReemplazada.HasValue))
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
                        var required = decimal.Round(
                            medida.CantidadRequerida * item.Cantidad
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

                    var extras = await _context.InvIngredientesExtra
                        .Include(e => e.IdUnidadMedidaNavigation)
                        .Include(e => e.IdMateriaPrimaNavigation)
                            .ThenInclude(m => m.IdUnidadMedidaNavigation)
                        .Where(e => idsExtra.Contains(e.IdIngredienteExtra))
                        .ToListAsync(cancellationToken);

                    foreach (var idExtra in idsExtra)
                    {
                        var extra = extras.FirstOrDefault(e => e.IdIngredienteExtra == idExtra);
                        if (extra == null || !extra.Activo)
                            return new SaleLinesResult { Error = $"El ingrediente extra seleccionado para {prod.NombreProducto} no existe o no está activo." };

                        var requiredExtra = decimal.Round(
                            extra.CantidadRequerida * item.Cantidad
                            * extra.IdUnidadMedidaNavigation.FactorConversionBase
                            / extra.IdMateriaPrimaNavigation.IdUnidadMedidaNavigation.FactorConversionBase,
                            3,
                            MidpointRounding.AwayFromZero);
                        if (requiredExtra <= 0)
                            return new SaleLinesResult { Error = $"La cantidad configurada para el extra {extra.NombreIngredienteExtra} es demasiado pequeña." };
                        if (extra.IdMateriaPrimaNavigation.Cantidad < requiredExtra)
                            return new SaleLinesResult { Error = $"Stock insuficiente de {extra.IdMateriaPrimaNavigation.NombreMaterial} para el extra {extra.NombreIngredienteExtra}. Se requieren {requiredExtra} {extra.IdMateriaPrimaNavigation.IdUnidadMedidaNavigation.Abreviacion}." };

                        extra.IdMateriaPrimaNavigation.Cantidad -= requiredExtra;
                        detail.VenDetalleVentaMateriales.Add(new VenDetalleVentaMateriales
                        {
                            IdMateriaPrima = extra.IdMateriaPrima,
                            CantidadDescontada = requiredExtra,
                            EsEleccionAlternativa = false,
                            Recargo = 0
                        });
                        detail.VenDetalleVentaIngrediente.Add(new VenDetalleVentaIngrediente
                        {
                            IdIngredienteExtra = extra.IdIngredienteExtra,
                            Precio = extra.Precio
                        });
                        recargoUnitario += extra.Precio;
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
                total += subtotal;

                detail.PrecioNormal = prod.Precio + recargoUnitario;
                detail.PrecioUnitario = finalUnitPrice;
                detail.Subtotal = subtotal;

                _context.VenDetalleVenta.Add(detail);
            }

            return new SaleLinesResult { Total = total };
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
