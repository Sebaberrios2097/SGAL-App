using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.Security;
using SgalApp.Api.Services;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Controllers;

/// <summary>
/// Reportes del segmento mostrador: ventas por producto, stock, compras y ventas por período.
/// Cada endpoint devuelve JSON; la exportación a CSV la arma el frontend a partir de estos datos.
/// </summary>
[ApiController]
[Route("api/reports")]
public class ReportsController(SgalContext context) : ControllerBase
{
    /// <summary>Ranking de productos vendidos (cantidad e ingresos) en un período.</summary>
    [HttpGet("sales-by-product")]
    [Permission(Permissions.DashboardView)]
    public async Task<IActionResult> SalesByProduct([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var (from, to) = ResolveRange(desde, hasta);
        var productos = await context.VenDetalleVenta.AsNoTracking()
            .Where(d => d.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && d.IdVentaNavigation.FechaVenta >= from && d.IdVentaNavigation.FechaVenta < to)
            .GroupBy(d => new { d.IdProducto, d.IdProductoNavigation.NombreProducto })
            .Select(g => new
            {
                g.Key.IdProducto,
                g.Key.NombreProducto,
                Cantidad = g.Sum(x => x.Cantidad),
                Ingresos = g.Sum(x => x.Subtotal)
            })
            .OrderByDescending(x => x.Cantidad)
            .ToListAsync();

        return Ok(new
        {
            Desde = from,
            Hasta = to.AddDays(-1),
            Productos = productos,
            TotalUnidades = productos.Sum(x => x.Cantidad),
            TotalIngresos = productos.Sum(x => x.Ingresos)
        });
    }

    /// <summary>Existencias actuales de los productos con control de stock, con su estado.</summary>
    [HttpGet("stock")]
    [Permission(Permissions.ProductsView)]
    public async Task<IActionResult> Stock()
    {
        var defaultMinimo = await context.OrgConfiguracion.AsNoTracking()
            .Select(c => (int?)c.StockMinimoDefault).FirstOrDefaultAsync() ?? 5;

        var productos = await context.InvProductos.AsNoTracking()
            .Where(p => p.Activo && !p.EsPack && p.RequiereReceta != true && p.Stock != null)
            .OrderBy(p => p.NombreProducto)
            .Select(p => new
            {
                p.IdProducto,
                p.NombreProducto,
                Categoria = p.IdCategoriaProductoNavigation.NombreCategoriaProducto,
                Stock = p.Stock ?? 0,
                Minimo = p.StockMinimo ?? defaultMinimo,
                p.Precio,
                Estado = (p.Stock ?? 0) <= 0 ? "agotado"
                    : (p.Stock ?? 0) <= (p.StockMinimo ?? defaultMinimo) ? "bajo" : "disponible"
            })
            .ToListAsync();

        return Ok(new
        {
            Productos = productos,
            Agotados = productos.Count(x => x.Estado == "agotado"),
            Bajos = productos.Count(x => x.Estado == "bajo")
        });
    }

    /// <summary>Órdenes de compra emitidas/recibidas en un período, con su gasto.</summary>
    [HttpGet("purchases")]
    [Permission(Permissions.PurchaseOrdersView)]
    public async Task<IActionResult> Purchases([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var (from, to) = ResolveRange(desde, hasta);
        var ordenes = await context.InvOrdenCompra.AsNoTracking()
            .Where(o => o.FechaSolicitud >= from && o.FechaSolicitud < to)
            .OrderByDescending(o => o.FechaSolicitud)
            .Select(o => new
            {
                o.IdOrdenCompra,
                Proveedor = o.IdProveedorNavigation.NombreProveedor,
                o.FechaSolicitud,
                o.FechaRecepcion,
                Estado = o.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra,
                o.MontoTotal,
                o.MontoTotalReal
            })
            .ToListAsync();

        return Ok(new
        {
            Desde = from,
            Hasta = to.AddDays(-1),
            Ordenes = ordenes,
            TotalEstimado = ordenes.Sum(x => x.MontoTotal),
            TotalReal = ordenes.Sum(x => x.MontoTotalReal ?? 0)
        });
    }

    /// <summary>Ventas totalizadas por día y por método de pago en un período.</summary>
    [HttpGet("sales-by-period")]
    [Permission(Permissions.DashboardView)]
    public async Task<IActionResult> SalesByPeriod([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var (from, to) = ResolveRange(desde, hasta);
        var ventas = await context.VenVentas.AsNoTracking()
            .Where(v => v.IdEstadoVenta == EstadosVenta.Terminada && v.FechaVenta >= from && v.FechaVenta < to)
            .Select(v => new { v.FechaVenta, v.MontoTotal })
            .ToListAsync();

        var porDia = ventas
            .GroupBy(v => v.FechaVenta.Date)
            .Select(g => new { Fecha = g.Key, Ventas = g.Count(), Total = g.Sum(x => x.MontoTotal) })
            .OrderBy(x => x.Fecha)
            .ToList();

        var porMetodo = await context.VenMetodosPagoVenta.AsNoTracking()
            .Where(m => m.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada
                && m.IdVentaNavigation.FechaVenta >= from && m.IdVentaNavigation.FechaVenta < to)
            .GroupBy(m => m.IdMetodoPagoNavigation.NombreMetodoPago)
            .Select(g => new { Metodo = g.Key, Total = g.Sum(x => x.Monto) })
            .OrderByDescending(x => x.Total)
            .ToListAsync();

        return Ok(new
        {
            Desde = from,
            Hasta = to.AddDays(-1),
            PorDia = porDia,
            PorMetodo = porMetodo,
            TotalVentas = porDia.Sum(x => x.Ventas),
            TotalMonto = porDia.Sum(x => x.Total)
        });
    }

    /// <summary>Rango por defecto: últimos 30 días. `hasta` es inclusivo (se suma un día para el filtro).</summary>
    private static (DateTime From, DateTime To) ResolveRange(DateTime? desde, DateTime? hasta)
    {
        var to = (hasta?.Date ?? DateTime.Today).AddDays(1);
        var from = desde?.Date ?? DateTime.Today.AddDays(-29);
        return (from, to);
    }
}
