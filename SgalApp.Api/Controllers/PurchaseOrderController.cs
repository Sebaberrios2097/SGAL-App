using System.Data;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Services;
using SgalApp.Api.Security;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/purchase-orders")]
public class PurchaseOrderController : ControllerBase
{
    private const string Draft = "Borrador";
    private const string Issued = "Emitida";
    private const string PartiallyReceived = "Recibida parcialmente";
    private const string Completed = "Completada";
    private const string Cancelled = "Cancelada";

    private readonly SgalContext _context;
    private readonly IPurchaseOrderExportService _exportService;

    public PurchaseOrderController(SgalContext context, IPurchaseOrderExportService exportService)
    {
        _context = context;
        _exportService = exportService;
    }

    [HttpGet("catalogs")]
    [Permission(Permissions.PurchaseOrdersView)]
    public async Task<IActionResult> GetCatalogs()
    {
        var providers = await _context.InvProveedores.AsNoTracking()
            .Where(x => x.Activo)
            .OrderBy(x => x.NombreProveedor)
            .Select(x => new { x.IdProveedor, x.NombreProveedor })
            .ToListAsync();
        var products = await _context.InvProductos.AsNoTracking()
            .Where(x => x.Activo && !(x.RequiereReceta ?? false))
            .OrderBy(x => x.NombreProducto)
            .Select(x => new
            {
                TipoItem = "Producto",
                IdItem = x.IdProducto,
                Codigo = x.CodigoProducto,
                Nombre = x.NombreProducto,
                Unidad = "un",
                Stock = (decimal)(x.Stock ?? 0),
                PrecioVenta = (int?)x.Precio
            }).ToListAsync();
        var rawMaterialData = await _context.InvMateriaPrima.AsNoTracking()
            .OrderBy(x => x.NombreMaterial)
            .Select(x => new
            {
                x.IdMateriaPrima,
                x.NombreMaterial,
                Unidad = x.IdUnidadMedidaNavigation.Abreviacion,
                x.Cantidad
            }).ToListAsync();
        var rawMaterials = rawMaterialData.Select(x => new
        {
            TipoItem = "MateriaPrima",
            IdItem = x.IdMateriaPrima,
            Codigo = $"MP-{x.IdMateriaPrima:D5}",
            Nombre = x.NombreMaterial,
            x.Unidad,
            Stock = x.Cantidad,
            PrecioVenta = (int?)null
        }).ToList();

        return Ok(new { Proveedores = providers, Productos = products, MateriasPrimas = rawMaterials });
    }

    [HttpGet]
    [Permission(Permissions.PurchaseOrdersView)]
    public async Task<IActionResult> GetAll()
    {
        var orders = await BaseQuery().AsNoTracking()
            .OrderByDescending(x => x.FechaSolicitud)
            .ToListAsync();
        return Ok(orders.Select(ToResponse));
    }

    [HttpGet("{id:int}")]
    [Permission(Permissions.PurchaseOrdersView)]
    public async Task<IActionResult> GetById(int id)
    {
        var order = await BaseQuery().AsNoTracking().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        return order == null ? NotFound(new { mensaje = "Orden de compra no encontrada." }) : Ok(ToResponse(order));
    }

    [HttpPost]
    [Permission(Permissions.PurchaseOrdersCreate)]
    public async Task<IActionResult> Create([FromBody] PurchaseOrderSaveDto dto)
    {
        var validation = await ValidateOrder(dto);
        if (validation != null) return BadRequest(new { mensaje = validation });

        var draftState = await GetState(Draft);
        if (draftState == null) return MissingMigration();

        var order = new InvOrdenCompra
        {
            IdUsuario = User.GetUserId(),
            IdProveedor = dto.IdProveedor,
            IdEstadoOrdenCompra = draftState.IdEstadoOrdenCompra,
            FechaSolicitud = DateTime.Now,
            FechaLlegadaPedido = dto.FechaLlegadaPedido,
            Observaciones = NormalizeText(dto.Observaciones, 500),
            CantidadProductos = dto.Items.Count,
            MontoTotal = CalculateEstimatedTotal(dto.Items),
            PreciosConfirmados = !dto.Items.Any(x => x.NuevoPrecioVenta.HasValue),
            InvOrdenDetalle = dto.Items.Select(CreateDetail).ToList()
        };
        _context.InvOrdenCompra.Add(order);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = order.IdOrdenCompra }, new { order.IdOrdenCompra });
    }

    [HttpPut("{id:int}")]
    [Permission(Permissions.PurchaseOrdersEdit)]
    public async Task<IActionResult> Update(int id, [FromBody] PurchaseOrderSaveDto dto)
    {
        var validation = await ValidateOrder(dto);
        if (validation != null) return BadRequest(new { mensaje = validation });

        var order = await BaseQuery().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        if (!StateIs(order, Draft)) return Conflict(new { mensaje = "Solo se pueden modificar órdenes en borrador." });

        order.IdProveedor = dto.IdProveedor;
        order.FechaLlegadaPedido = dto.FechaLlegadaPedido;
        order.Observaciones = NormalizeText(dto.Observaciones, 500);
        order.CantidadProductos = dto.Items.Count;
        order.MontoTotal = CalculateEstimatedTotal(dto.Items);
        order.PreciosConfirmados = !dto.Items.Any(x => x.NuevoPrecioVenta.HasValue);
        _context.InvOrdenDetalle.RemoveRange(order.InvOrdenDetalle);
        order.InvOrdenDetalle = dto.Items.Select(CreateDetail).ToList();
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Orden de compra actualizada." });
    }

    [HttpPost("{id:int}/issue")]
    [Permission(Permissions.PurchaseOrdersIssue)]
    public async Task<IActionResult> Issue(int id, [FromBody] PurchaseOrderUserActionDto dto)
    {
        var order = await BaseQuery().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        if (!StateIs(order, Draft)) return Conflict(new { mensaje = "La orden ya no está en borrador." });
        if (order.InvOrdenDetalle.Count == 0) return BadRequest(new { mensaje = "La orden no tiene artículos." });

        var state = await GetState(Issued);
        if (state == null) return MissingMigration();
        order.IdEstadoOrdenCompra = state.IdEstadoOrdenCompra;
        order.FechaEmision = DateTime.Now;
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Orden emitida correctamente." });
    }

    [HttpPost("{id:int}/receive")]
    [Permission(Permissions.PurchaseOrdersReceive)]
    public async Task<IActionResult> Receive(int id, [FromBody] PurchaseOrderReceiveDto dto)
    {

        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var order = await BaseQuery().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        if (!StateIs(order, Issued)) return Conflict(new { mensaje = "Solo se pueden recibir órdenes emitidas." });
        if (dto.Items.Count != order.InvOrdenDetalle.Count
            || dto.Items.Select(x => x.IdOrdenDetalle).Distinct().Count() != order.InvOrdenDetalle.Count)
            return BadRequest(new { mensaje = "Debe informar la recepción de todos los artículos de la orden." });

        var receivedById = dto.Items.ToDictionary(x => x.IdOrdenDetalle);
        if (order.InvOrdenDetalle.Any(x => !receivedById.ContainsKey(x.IdOrdenDetalle)))
            return BadRequest(new { mensaje = "La recepción contiene artículos que no corresponden a la orden." });

        foreach (var detail in order.InvOrdenDetalle)
        {
            var received = receivedById[detail.IdOrdenDetalle];
            if (received.CantidadRecibida < 0 || received.CantidadRecibida > detail.Cantidad)
                return BadRequest(new { mensaje = $"La cantidad recibida de {GetItemName(detail)} debe estar entre 0 y {detail.Cantidad:0.###}." });
            if (received.PrecioUnitarioReal < 0)
                return BadRequest(new { mensaje = "Los costos reales no pueden ser negativos." });
            if (detail.IdProducto.HasValue && decimal.Truncate(received.CantidadRecibida) != received.CantidadRecibida)
                return BadRequest(new { mensaje = $"La cantidad recibida de {GetItemName(detail)} debe ser entera." });
            if (received.NuevoPrecioVenta.HasValue && (!detail.IdProducto.HasValue || received.NuevoPrecioVenta <= 0))
                return BadRequest(new { mensaje = "El nuevo precio de venta solo puede asignarse a productos y debe ser mayor que cero." });
        }

        foreach (var detail in order.InvOrdenDetalle)
        {
            var received = receivedById[detail.IdOrdenDetalle];
            detail.CantidadRecibida = received.CantidadRecibida;
            detail.PrecioUnitarioReal = received.PrecioUnitarioReal;
            detail.SubtotalReal = CalculateSubtotal(received.CantidadRecibida, received.PrecioUnitarioReal);
            detail.ObservacionRecepcion = NormalizeText(received.ObservacionRecepcion, 300);
            detail.NuevoPrecioVenta = received.NuevoPrecioVenta;
            detail.PrecioConfirmado = false;

            if (detail.IdProductoNavigation != null)
            {
                detail.PrecioVentaAnterior = detail.IdProductoNavigation.Precio;
                detail.IdProductoNavigation.Stock = (detail.IdProductoNavigation.Stock ?? 0) + decimal.ToInt32(received.CantidadRecibida);
            }
            else if (detail.IdMateriaPrimaNavigation != null)
            {
                detail.IdMateriaPrimaNavigation.Cantidad += received.CantidadRecibida;
            }
        }

        var allReceived = order.InvOrdenDetalle.All(x => x.CantidadRecibida == x.Cantidad);
        var state = await GetState(allReceived ? Completed : PartiallyReceived);
        if (state == null) return MissingMigration();
        order.IdEstadoOrdenCompra = state.IdEstadoOrdenCompra;
        order.FechaRecepcion = DateTime.Now;
        order.MontoTotalReal = order.InvOrdenDetalle.Sum(x => x.SubtotalReal ?? 0);
        order.PreciosConfirmados = !order.InvOrdenDetalle.Any(x => x.NuevoPrecioVenta.HasValue);
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new
        {
            mensaje = allReceived ? "Recepción completada y stock actualizado." : "Recepción parcial registrada y stock actualizado.",
            requiereConfirmacionPrecios = !order.PreciosConfirmados
        });
    }

    [HttpPost("{id:int}/confirm-prices")]
    [Permission(Permissions.PurchaseOrdersConfirmPrices)]
    public async Task<IActionResult> ConfirmPrices(int id, [FromBody] PurchaseOrderConfirmPricesDto dto)
    {
        var order = await BaseQuery().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        if (!StateIs(order, Completed) && !StateIs(order, PartiallyReceived))
            return Conflict(new { mensaje = "Los precios solo se pueden confirmar después de recibir la orden." });

        var requestedIds = dto.IdsOrdenDetalle.Distinct().ToHashSet();
        var pending = order.InvOrdenDetalle
            .Where(x => requestedIds.Contains(x.IdOrdenDetalle) && x.NuevoPrecioVenta.HasValue && !x.PrecioConfirmado)
            .ToList();
        if (pending.Count == 0)
            return BadRequest(new { mensaje = "No se seleccionaron cambios de precio pendientes." });
        if (pending.Any(x => x.IdProductoNavigation == null))
            return BadRequest(new { mensaje = "Solo los productos pueden cambiar su precio de venta." });

        await using var transaction = await _context.Database.BeginTransactionAsync();
        foreach (var detail in pending)
        {
            detail.IdProductoNavigation!.Precio = detail.NuevoPrecioVenta!.Value;
            detail.IdProductoNavigation.FechaModificacion = DateTime.Now;
            detail.PrecioConfirmado = true;
        }
        order.PreciosConfirmados = order.InvOrdenDetalle.All(x => !x.NuevoPrecioVenta.HasValue || x.PrecioConfirmado);
        if (order.PreciosConfirmados) order.FechaConfirmacionPrecios = DateTime.Now;
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { mensaje = "Precios de venta actualizados.", preciosConfirmados = order.PreciosConfirmados });
    }

    [HttpPost("{id:int}/cancel")]
    [Permission(Permissions.PurchaseOrdersCancel)]
    public async Task<IActionResult> Cancel(int id, [FromBody] PurchaseOrderUserActionDto dto)
    {
        var order = await BaseQuery().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        if (!StateIs(order, Draft) && !StateIs(order, Issued))
            return Conflict(new { mensaje = "Esta orden ya no se puede cancelar." });
        var state = await GetState(Cancelled);
        if (state == null) return MissingMigration();
        order.IdEstadoOrdenCompra = state.IdEstadoOrdenCompra;
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Orden cancelada." });
    }

    [HttpGet("{id:int}/pdf")]
    [Permission(Permissions.PurchaseOrdersExport)]
    public async Task<IActionResult> DownloadPdf(int id)
    {
        var order = await BaseQuery().AsNoTracking().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        return File(_exportService.CreatePdf(ToExportModel(order)), "application/pdf", $"orden-compra-{id}.pdf");
    }

    [HttpGet("{id:int}/excel")]
    [Permission(Permissions.PurchaseOrdersExport)]
    public async Task<IActionResult> DownloadExcel(int id)
    {
        var order = await BaseQuery().AsNoTracking().FirstOrDefaultAsync(x => x.IdOrdenCompra == id);
        if (order == null) return NotFound(new { mensaje = "Orden de compra no encontrada." });
        return File(_exportService.CreateExcel(ToExportModel(order)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"orden-compra-{id}.xlsx");
    }

    private IQueryable<InvOrdenCompra> BaseQuery() => _context.InvOrdenCompra
        .Include(x => x.IdProveedorNavigation)
        .Include(x => x.IdEstadoOrdenCompraNavigation)
        .Include(x => x.IdUsuarioNavigation).ThenInclude(x => x.EmpEmpleados)
        .Include(x => x.InvOrdenDetalle).ThenInclude(x => x.IdProductoNavigation)
        .Include(x => x.InvOrdenDetalle).ThenInclude(x => x.IdMateriaPrimaNavigation).ThenInclude(x => x!.IdUnidadMedidaNavigation)
        .AsSplitQuery();

    private async Task<string?> ValidateOrder(PurchaseOrderSaveDto dto)
    {
        if (!await _context.InvProveedores.AnyAsync(x => x.IdProveedor == dto.IdProveedor && x.Activo))
            return "Debe seleccionar un proveedor activo.";
        if (dto.FechaLlegadaPedido.Date < DateTime.Today) return "La fecha esperada de llegada no puede estar en el pasado.";
        if (dto.Observaciones?.Trim().Length > 500) return "Las observaciones no pueden superar los 500 caracteres.";
        if (dto.Items.Count == 0) return "Debe agregar al menos un artículo.";

        var keys = new HashSet<string>();
        foreach (var item in dto.Items)
        {
            var type = NormalizeItemType(item.TipoItem);
            if (type == null) return "El tipo de artículo no es válido.";
            if (!keys.Add($"{type}:{item.IdItem}")) return "No puede repetir un artículo en la orden.";
            if (item.Cantidad <= 0) return "Todas las cantidades deben ser mayores que cero.";
            if (item.PrecioUnitario < 0) return "Los costos estimados no pueden ser negativos.";
            if (type == "Producto")
            {
                if (decimal.Truncate(item.Cantidad) != item.Cantidad) return "Las cantidades de productos deben ser enteras.";
                if (!await _context.InvProductos.AnyAsync(x => x.IdProducto == item.IdItem && x.Activo && !(x.RequiereReceta ?? false)))
                    return "Uno de los productos no está disponible para reabastecimiento directo.";
                if (item.NuevoPrecioVenta.HasValue && item.NuevoPrecioVenta <= 0) return "El nuevo precio de venta debe ser mayor que cero.";
            }
            else
            {
                if (!await _context.InvMateriaPrima.AnyAsync(x => x.IdMateriaPrima == item.IdItem)) return "Una de las materias primas no existe.";
                if (item.NuevoPrecioVenta.HasValue) return "Las materias primas no tienen precio de venta.";
            }
        }
        return null;
    }

    private static InvOrdenDetalle CreateDetail(PurchaseOrderItemDto item) => new()
    {
        IdProducto = NormalizeItemType(item.TipoItem) == "Producto" ? item.IdItem : null,
        IdMateriaPrima = NormalizeItemType(item.TipoItem) == "MateriaPrima" ? item.IdItem : null,
        Cantidad = item.Cantidad,
        PrecioUnitario = item.PrecioUnitario,
        Subtotal = CalculateSubtotal(item.Cantidad, item.PrecioUnitario),
        CantidadRecibida = 0,
        NuevoPrecioVenta = item.NuevoPrecioVenta,
        PrecioConfirmado = false
    };

    private static int CalculateEstimatedTotal(IEnumerable<PurchaseOrderItemDto> items) =>
        items.Sum(x => CalculateSubtotal(x.Cantidad, x.PrecioUnitario));

    private static int CalculateSubtotal(decimal quantity, int price) =>
        decimal.ToInt32(decimal.Round(quantity * price, 0, MidpointRounding.AwayFromZero));

    private async Task<InvEstadosOrdenCompra?> GetState(string name) => await _context.InvEstadosOrdenCompra
        .FirstOrDefaultAsync(x => x.NombreEstadoOrdenCompra == name);

    private ObjectResult MissingMigration() => StatusCode(StatusCodes.Status503ServiceUnavailable,
        new { mensaje = "Falta aplicar el script de base de datos de órdenes de compra." });

    private static bool StateIs(InvOrdenCompra order, string name) =>
        string.Equals(order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra, name, StringComparison.OrdinalIgnoreCase);

    private static string? NormalizeItemType(string? type) => type?.Trim().ToLowerInvariant() switch
    {
        "producto" => "Producto",
        "materiaprima" or "materia prima" => "MateriaPrima",
        _ => null
    };

    private static string? NormalizeText(string? value, int maxLength)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        return normalized?.Length > maxLength ? normalized[..maxLength] : normalized;
    }

    private static string GetItemName(InvOrdenDetalle detail) =>
        detail.IdProductoNavigation?.NombreProducto ?? detail.IdMateriaPrimaNavigation?.NombreMaterial ?? "artículo";

    private static string GetEmployeeName(EmpUsuarios user)
    {
        var employee = user.EmpEmpleados
            .OrderByDescending(x => x.Activo)
            .ThenByDescending(x => x.FechaIngreso)
            .FirstOrDefault();

        if (employee == null) return user.NombreUsuario;

        var fullName = string.Join(" ", new[] { employee.Nombres, employee.Apellido1, employee.Apellido2 }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim()));

        return string.IsNullOrWhiteSpace(fullName) ? user.NombreUsuario : fullName;
    }

    private static string GetReceptionState(InvOrdenCompra order, InvOrdenDetalle detail)
    {
        if (!order.FechaRecepcion.HasValue) return "Pendiente";
        if (detail.CantidadRecibida == 0) return "No recibido";
        return detail.CantidadRecibida < detail.Cantidad ? "Parcial" : "Recibido";
    }

    private static object ToResponse(InvOrdenCompra order) => new
    {
        order.IdOrdenCompra,
        order.IdProveedor,
        Proveedor = order.IdProveedorNavigation.NombreProveedor,
        order.IdUsuario,
        Usuario = order.IdUsuarioNavigation.NombreUsuario,
        order.IdEstadoOrdenCompra,
        Estado = order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra,
        order.CantidadProductos,
        TotalEstimado = order.MontoTotal,
        TotalReal = order.MontoTotalReal,
        order.FechaSolicitud,
        FechaLlegadaEsperada = order.FechaLlegadaPedido,
        order.FechaEmision,
        order.FechaRecepcion,
        order.Observaciones,
        order.PreciosConfirmados,
        order.FechaConfirmacionPrecios,
        TienePreciosPendientes = order.FechaRecepcion.HasValue
            && order.InvOrdenDetalle.Any(x => x.NuevoPrecioVenta.HasValue && !x.PrecioConfirmado),
        Items = order.InvOrdenDetalle.OrderBy(x => GetItemName(x)).Select(detail => new
        {
            detail.IdOrdenDetalle,
            TipoItem = detail.IdProducto.HasValue ? "Producto" : "MateriaPrima",
            IdItem = detail.IdProducto ?? detail.IdMateriaPrima,
            Codigo = detail.IdProductoNavigation?.CodigoProducto ?? $"MP-{detail.IdMateriaPrima:D5}",
            Nombre = GetItemName(detail),
            Unidad = detail.IdProducto.HasValue ? "un" : detail.IdMateriaPrimaNavigation?.IdUnidadMedidaNavigation.Abreviacion,
            StockActual = detail.IdProductoNavigation != null
                ? (decimal)(detail.IdProductoNavigation.Stock ?? 0)
                : detail.IdMateriaPrimaNavigation?.Cantidad ?? 0,
            CantidadSolicitada = detail.Cantidad,
            detail.CantidadRecibida,
            detail.PrecioUnitario,
            detail.PrecioUnitarioReal,
            SubtotalEstimado = detail.Subtotal,
            detail.SubtotalReal,
            PrecioVentaActual = detail.IdProductoNavigation?.Precio,
            detail.PrecioVentaAnterior,
            detail.NuevoPrecioVenta,
            detail.PrecioConfirmado,
            detail.ObservacionRecepcion,
            EstadoRecepcion = GetReceptionState(order, detail)
        })
    };

    private static PurchaseOrderExportModel ToExportModel(InvOrdenCompra order) => new(
        order.IdOrdenCompra,
        order.IdProveedorNavigation.NombreProveedor,
        order.IdProveedorNavigation.Rut,
        order.IdProveedorNavigation.Direccion,
        order.IdProveedorNavigation.Comuna,
        order.IdProveedorNavigation.Ciudad,
        order.IdProveedorNavigation.Telefono,
        order.IdProveedorNavigation.Correo,
        order.IdProveedorNavigation.NombreContacto,
        order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra,
        GetEmployeeName(order.IdUsuarioNavigation),
        order.FechaSolicitud,
        order.FechaLlegadaPedido,
        order.FechaRecepcion,
        order.Observaciones,
        order.MontoTotal,
        order.MontoTotalReal,
        order.InvOrdenDetalle.OrderBy(GetItemName).Select(detail => new PurchaseOrderExportItem(
            detail.IdProducto.HasValue ? "Producto" : "Materia prima",
            detail.IdProductoNavigation?.CodigoProducto ?? $"MP-{detail.IdMateriaPrima:D5}",
            GetItemName(detail),
            detail.IdProducto.HasValue ? "un" : detail.IdMateriaPrimaNavigation?.IdUnidadMedidaNavigation.Abreviacion ?? string.Empty,
            detail.Cantidad,
            detail.CantidadRecibida,
            detail.PrecioUnitario,
            detail.PrecioUnitarioReal,
            detail.Subtotal,
            detail.SubtotalReal,
            detail.PrecioVentaAnterior ?? detail.IdProductoNavigation?.Precio,
            detail.NuevoPrecioVenta,
            detail.PrecioConfirmado,
            GetReceptionState(order, detail))).ToList());
}
