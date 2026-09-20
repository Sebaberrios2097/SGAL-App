using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.Security;
using SgalApp.Api.Services;
using SgalApp.Infrastructure.Context;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/inventory-dashboard")]
public class InventoryDashboardController(SgalContext context) : ControllerBase
{
    [HttpGet]
    [Permission(Permissions.ProductsView + "|" + Permissions.RawMaterialsView)]
    public async Task<IActionResult> GetOverview()
    {
        var since = DateTime.Today.AddDays(-30);
        var materialsEnabled = await context.SegModulos.AsNoTracking().AnyAsync(module =>
            module.Codigo == "recetas" && module.Activo
            && (module.EsNucleo || (module.ConfiguracionOrganizacion != null && module.ConfiguracionOrganizacion.Habilitado)));

        var productExits = await context.VenDetalleVenta.AsNoTracking()
            .Where(d => d.IdVentaNavigation.FechaVenta >= since
                && d.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
            .GroupBy(d => d.IdProducto)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Cantidad) })
            .ToDictionaryAsync(x => x.Id, x => (decimal)x.Quantity);

        var productEntries = await context.InvOrdenDetalle.AsNoTracking()
            .Where(d => d.IdProducto != null && d.IdOrdenCompraNavigation.FechaRecepcion >= since)
            .GroupBy(d => d.IdProducto!.Value)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.CantidadRecibida * x.CantidadContenidoFormato) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);

        var productPending = await context.InvOrdenDetalle.AsNoTracking()
            .Where(d => d.IdProducto != null && d.Cantidad > d.CantidadRecibida
                && d.IdOrdenCompraNavigation.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra != "Cancelada")
            .GroupBy(d => d.IdProducto!.Value)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => (x.Cantidad - x.CantidadRecibida) * x.CantidadContenidoFormato) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);

        var productsRaw = await context.InvProductos.AsNoTracking()
            .Where(p => p.Activo)
            .OrderBy(p => p.NombreProducto)
            .Select(p => new { p.IdProducto, p.NombreProducto, Categoria = p.IdCategoriaProductoNavigation.NombreCategoriaProducto, p.Stock, p.Precio, p.RequiereReceta })
            .ToListAsync();
        var products = productsRaw.Select(p =>
        {
            var controlled = p.Stock.HasValue;
            var stock = p.Stock ?? 0;
            return new
            {
                p.IdProducto, p.NombreProducto, p.Categoria, p.Stock, p.Precio, p.RequiereReceta,
                Controlado = controlled,
                Entradas30Dias = productEntries.GetValueOrDefault(p.IdProducto),
                Salidas30Dias = productExits.GetValueOrDefault(p.IdProducto),
                PorRecibir = productPending.GetValueOrDefault(p.IdProducto),
                Estado = !controlled ? "sin_control" : stock <= 0 ? "agotado" : stock <= 5 ? "bajo" : "disponible"
            };
        }).ToList();

        var materialSaleExits = await context.VenDetalleVentaMateriales.AsNoTracking()
            .Where(m => m.IdDetalleVentaNavigation.IdVentaNavigation.FechaVenta >= since
                && m.IdDetalleVentaNavigation.IdVentaNavigation.IdEstadoVenta == EstadosVenta.Terminada)
            .GroupBy(m => m.IdMateriaPrima)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.CantidadDescontada) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);
        var extractionExits = await context.TurExtracciones.AsNoTracking()
            .Where(e => e.IdMateriaPrima != null && e.IdBitacoraNavigation.FechaCreacion >= since)
            .GroupBy(e => e.IdMateriaPrima!.Value)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.CantidadDescontada) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);
        var materialEntries = await context.InvOrdenDetalle.AsNoTracking()
            .Where(d => d.IdMateriaPrima != null && d.IdOrdenCompraNavigation.FechaRecepcion >= since)
            .GroupBy(d => d.IdMateriaPrima!.Value)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.CantidadRecibida * x.CantidadContenidoFormato) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);
        var materialPending = await context.InvOrdenDetalle.AsNoTracking()
            .Where(d => d.IdMateriaPrima != null && d.Cantidad > d.CantidadRecibida
                && d.IdOrdenCompraNavigation.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra != "Cancelada")
            .GroupBy(d => d.IdMateriaPrima!.Value)
            .Select(g => new { Id = g.Key, Quantity = g.Sum(x => (x.Cantidad - x.CantidadRecibida) * x.CantidadContenidoFormato) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity);

        var materialsRaw = await context.InvMateriaPrima.AsNoTracking()
            .OrderBy(m => m.NombreMaterial)
            .Select(m => new
            {
                m.IdMateriaPrima, m.NombreMaterial, m.Cantidad, m.NoDescuentaInventario,
                Unidad = m.IdUnidadMedidaNavigation.Abreviacion,
                Categoria = m.IdCategoriaMateriaNavigation.NombreCategoriaMateria,
                Umbral = m.InvPresentacionesMateriaPrima.Where(p => p.Activo).Min(p => (decimal?)p.CantidadContenido)
            }).ToListAsync();
        var materials = materialsRaw.Select(m =>
        {
            var threshold = m.Umbral ?? 1m;
            var exits = materialSaleExits.GetValueOrDefault(m.IdMateriaPrima) + extractionExits.GetValueOrDefault(m.IdMateriaPrima);
            return new
            {
                m.IdMateriaPrima, m.NombreMaterial, m.Cantidad, m.Unidad, m.Categoria,
                Controlado = !m.NoDescuentaInventario,
                Entradas30Dias = materialEntries.GetValueOrDefault(m.IdMateriaPrima),
                Salidas30Dias = exits,
                PorRecibir = materialPending.GetValueOrDefault(m.IdMateriaPrima),
                Estado = m.NoDescuentaInventario ? "sin_control" : m.Cantidad <= 0 ? "agotado" : m.Cantidad <= threshold ? "bajo" : "disponible"
            };
        }).ToList();

        var recentOrders = await context.InvOrdenCompra.AsNoTracking()
            .Where(o => o.FechaRecepcion != null)
            .OrderByDescending(o => o.FechaRecepcion)
            .Take(8)
            .Select(o => new
            {
                o.IdOrdenCompra, Fecha = o.FechaRecepcion!.Value, Tipo = "entrada", Origen = "Orden de compra",
                Descripcion = o.IdProveedorNavigation.NombreProveedor,
                Cantidad = o.InvOrdenDetalle.Sum(d => d.CantidadRecibida * d.CantidadContenidoFormato)
            }).ToListAsync();

        return Ok(new
        {
            Resumen = new
            {
                ProductosAgotados = products.Count(x => x.Estado == "agotado"),
                ProductosBajos = products.Count(x => x.Estado == "bajo"),
                MaterialesAgotados = materialsEnabled ? materials.Count(x => x.Estado == "agotado") : 0,
                MaterialesBajos = materialsEnabled ? materials.Count(x => x.Estado == "bajo") : 0,
                OrdenesPendientes = await context.InvOrdenCompra.CountAsync(o => o.InvOrdenDetalle.Any(d => d.Cantidad > d.CantidadRecibida)
                    && o.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra != "Cancelada")
            },
            Products = products,
            Materials = materialsEnabled ? materials.Cast<object>().ToList() : [],
            RecentEntries = recentOrders
        });
    }
}
