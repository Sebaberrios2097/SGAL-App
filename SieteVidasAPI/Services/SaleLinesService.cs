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

                // Los productos con receta descuentan materias primas convertidas a la
                // unidad de inventario. El snapshot permite reponer exactamente al anular.
                if (prod.RequiereReceta == true)
                {
                    var recipe = prod.InvRecetas.FirstOrDefault();
                    if (recipe == null || recipe.InvMaterialesReceta.Count == 0)
                        return new SaleLinesResult { Error = $"El producto {prod.NombreProducto} no tiene una receta activa configurada." };

                    foreach (var material in recipe.InvMaterialesReceta)
                    {
                        var required = decimal.Round(
                            material.CantidadRequerida * item.Cantidad
                            * material.IdUnidadMedidaNavigation.FactorConversionBase
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
                            CantidadDescontada = required
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

                int subtotal = finalUnitPrice * item.Cantidad;
                total += subtotal;

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
                if (detalle.VenDetalleVentaMateriales.Count > 0)
                {
                    foreach (var material in detalle.VenDetalleVentaMateriales)
                        material.IdMateriaPrimaNavigation.Cantidad += material.CantidadDescontada;
                    continue;
                }

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
