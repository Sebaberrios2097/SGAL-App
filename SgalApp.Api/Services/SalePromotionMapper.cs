using SgalApp.Api.DTOs;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Services;

/// <summary>Reconstruye la selección editable y el resumen de una promoción persistida.</summary>
public static class SalePromotionMapper
{
    public static SaleAppliedPromotionDto Map(VenVentaPromociones ventaPromo)
    {
        var restantes = ventaPromo.Lineas
            .GroupBy(l => l.IdProducto)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.Cantidad));

        foreach (var fijo in ventaPromo.IdPromocionNavigation.Grupos
            .Where(g => g.EsBase).SelectMany(g => g.Productos))
        {
            restantes[fijo.IdProducto] = restantes.GetValueOrDefault(fijo.IdProducto)
                - fijo.Cantidad * ventaPromo.Cantidad;
        }

        var selecciones = new List<SalePromoSelectionDto>();
        foreach (var grupo in ventaPromo.IdPromocionNavigation.Grupos.Where(g => !g.EsBase).OrderBy(g => g.Orden))
        {
            var faltanPorInstancia = grupo.CantidadElegir;
            foreach (var opcion in grupo.Productos)
            {
                if (faltanPorInstancia == 0) break;
                var disponibles = Math.Max(0, restantes.GetValueOrDefault(opcion.IdProducto));
                var unidadesPorEleccion = Math.Max(1, opcion.Cantidad);
                var cantidadPorInstancia = ventaPromo.Cantidad > 0
                    ? disponibles / (ventaPromo.Cantidad * unidadesPorEleccion)
                    : 0;
                var tomar = Math.Min(faltanPorInstancia, cantidadPorInstancia);
                if (tomar <= 0) continue;
                selecciones.Add(new SalePromoSelectionDto
                {
                    IdGrupo = grupo.IdGrupo,
                    IdProducto = opcion.IdProducto,
                    Cantidad = tomar
                });
                restantes[opcion.IdProducto] = disponibles - tomar * unidadesPorEleccion * ventaPromo.Cantidad;
                faltanPorInstancia -= tomar;
            }
        }

        return new SaleAppliedPromotionDto
        {
            IdVentaPromocion = ventaPromo.IdVentaPromocion,
            IdPromocion = ventaPromo.IdPromocion,
            Nombre = ventaPromo.IdPromocionNavigation.Nombre,
            Cantidad = ventaPromo.Cantidad,
            Precio = ventaPromo.Precio,
            MontoIndividual = ventaPromo.MontoIndividual,
            Descuento = ventaPromo.Descuento,
            Selecciones = selecciones,
            Productos = ventaPromo.Lineas.Select(l => new SaleAppliedPromotionProductDto
            {
                IdProducto = l.IdProducto,
                NombreProducto = l.IdProductoNavigation.NombreProducto,
                Cantidad = l.Cantidad,
                PrecioUnitario = l.PrecioUnitario,
                Subtotal = l.Subtotal
            }).ToList()
        };
    }
}
