using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.Security;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Controllers;

[ApiController]
[Route("api/returnables")]
public sealed class ReturnablesController(SgalContext context) : ControllerBase
{
    [HttpGet("configuration")]
    [Permission(Permissions.ReturnablesConfigure)]
    public async Task<IActionResult> Configuration()
    {
        var config = await context.OrgConfiguracion.AsNoTracking().FirstAsync(x => x.IdConfiguracion == 1);
        var products = await context.InvProductos.AsNoTracking().Where(x => x.Activo)
            .OrderBy(x => x.NombreProducto).Select(x => new
            {
                x.IdProducto, x.NombreProducto, x.Precio,
                Retornable = context.VenProductosRetornables.Any(r => r.IdProducto == x.IdProducto && r.Activo),
                PrecioEnvase = context.VenProductosRetornables.Where(r => r.IdProducto == x.IdProducto && r.Activo).Select(r => r.PrecioEnvase).FirstOrDefault(),
                MedioPago = context.VenProductosRetornables.Where(r => r.IdProducto == x.IdProducto && r.Activo).Select(r => r.MedioPago).FirstOrDefault()
            }).ToListAsync();
        return Ok(new { config.RetornablesPrecioGeneral, config.RetornablesMedioPago, config.RetornablesVigenciaDias, Productos = products });
    }

    [HttpPut("configuration")]
    [Permission(Permissions.ReturnablesConfigure)]
    public async Task<IActionResult> UpdateConfiguration(ReturnablesConfigurationDto dto)
    {
        if (dto.PrecioGeneral < 0 || dto.VigenciaDias is <= 0)
            return BadRequest(new { mensaje = "El precio no puede ser negativo y la vigencia debe ser mayor que cero." });
        var method = NormalizeMethod(dto.MedioPago);
        if (method == null) return BadRequest(new { mensaje = "El medio de pago debe ser EFECTIVO o TODOS." });
        var config = await context.OrgConfiguracion.FirstAsync(x => x.IdConfiguracion == 1);
        config.RetornablesPrecioGeneral = dto.PrecioGeneral;
        config.RetornablesMedioPago = method;
        config.RetornablesVigenciaDias = dto.VigenciaDias;
        var existing = await context.VenProductosRetornables.ToListAsync();
        var requested = dto.Productos.ToDictionary(x => x.IdProducto);
        foreach (var item in existing) item.Activo = requested.ContainsKey(item.IdProducto);
        foreach (var input in dto.Productos)
        {
            if (input.PrecioEnvase is < 0) return BadRequest(new { mensaje = "El precio especial no puede ser negativo." });
            var specialMethod = input.MedioPago == null ? null : NormalizeMethod(input.MedioPago);
            if (input.MedioPago != null && specialMethod == null) return BadRequest(new { mensaje = "El medio de pago especial no es válido." });
            var item = existing.FirstOrDefault(x => x.IdProducto == input.IdProducto);
            if (item == null) context.VenProductosRetornables.Add(new VenProductoRetornable { IdProducto = input.IdProducto, Activo = true, PrecioEnvase = input.PrecioEnvase, MedioPago = specialMethod, FechaActualizacion = DateTime.UtcNow });
            else { item.Activo = true; item.PrecioEnvase = input.PrecioEnvase; item.MedioPago = specialMethod; item.FechaActualizacion = DateTime.UtcNow; }
        }
        await context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Productos retornables activos con su precio y medio de pago ya resueltos,
    /// para que el POS pueda preguntar por el envase al agregar cada producto.</summary>
    [HttpGet("pos")]
    [Permission(Permissions.CajaOperate + "|" + Permissions.CajaCollect + "|" + Permissions.SalesCreate)]
    public async Task<IActionResult> PosCatalog()
    {
        var config = await context.OrgConfiguracion.AsNoTracking()
            .Where(x => x.IdConfiguracion == 1)
            .Select(x => new { x.RetornablesPrecioGeneral, x.RetornablesMedioPago })
            .FirstAsync();
        var items = await context.VenProductosRetornables.AsNoTracking()
            .Where(x => x.Activo)
            .Select(x => new
            {
                x.IdProducto,
                PrecioEnvase = x.PrecioEnvase ?? config.RetornablesPrecioGeneral,
                MedioPago = x.MedioPago ?? config.RetornablesMedioPago
            }).ToListAsync();
        return Ok(items);
    }

    [HttpGet("voucher/{code}")]
    [Permission(Permissions.ReturnablesRedeem)]
    public async Task<IActionResult> Voucher(string code)
    {
        var voucher = await FindVoucher(code);
        return voucher == null ? NotFound(new { mensaje = "Vale no encontrado." }) : Ok(ToDto(voucher));
    }

    [HttpPost("voucher/{code}/redeem")]
    [Permission(Permissions.ReturnablesRedeem)]
    public async Task<IActionResult> Redeem(string code, RedeemReturnablesDto dto)
    {
        var now = DateTime.Now;
        var voucher = await FindVoucher(code, tracking: true);
        if (voucher == null) return NotFound(new { mensaje = "Vale no encontrado." });
        if (voucher.Estado != "VIGENTE") return BadRequest(new { mensaje = "Este vale ya no está vigente." });
        if (voucher.FechaVencimiento.HasValue && voucher.FechaVencimiento < now)
        { voucher.Estado = "VENCIDO"; await context.SaveChangesAsync(); return BadRequest(new { mensaje = "El vale está vencido." }); }
        var turn = await context.TurTurno.FirstOrDefaultAsync(x => x.IdUsuario == User.GetUserId() && x.IdEstadoTurno == 1);
        if (turn == null) return BadRequest(new { mensaje = "Debe tener un turno abierto para canjear el vale." });
        var returned = dto.Productos.GroupBy(x => x.IdProducto).ToDictionary(x => x.Key, x => x.Sum(y => y.Cantidad));
        if (returned.Any(x => x.Value < 0) || returned.Any(x => voucher.Detalles.All(d => d.IdProducto != x.Key)))
            return BadRequest(new { mensaje = "La devolución contiene cantidades o productos no válidos." });
        var redeemedAmount = voucher.Detalles.Sum(x => Math.Min(x.Cantidad, returned.GetValueOrDefault(x.IdProducto)) * x.PrecioUnitario);
        if (redeemedAmount <= 0) return BadRequest(new { mensaje = "Indique al menos un envase recibido." });
        voucher.Estado = "CANJEADO"; voucher.FechaCanje = now; voucher.IdTurnoCanje = turn.IdTurno;
        voucher.IdUsuarioCanje = User.GetUserId(); voucher.MontoCanjeado = redeemedAmount;
        var remaining = voucher.Detalles.Select(x => new { Detail = x, Quantity = x.Cantidad - Math.Min(x.Cantidad, returned.GetValueOrDefault(x.IdProducto)) }).Where(x => x.Quantity > 0).ToList();
        VenValeEnvase? successor = null;
        if (remaining.Count > 0)
        {
            successor = new VenValeEnvase { Codigo = await ReturnableVoucherCode.NextAsync(context), IdVenta = voucher.IdVenta,
                IdValePadre = voucher.IdValeEnvase, IdValeOrigen = voucher.IdValeOrigen ?? voucher.IdValeEnvase,
                FechaEmision = now, FechaVencimiento = voucher.FechaVencimiento, Estado = "VIGENTE",
                MontoOriginal = remaining.Sum(x => x.Quantity * x.Detail.PrecioUnitario),
                // Reutiliza la navegación Producto ya cargada del vale original para que el DTO del
                // vale de saldo lleve el nombre al imprimirse (sin una consulta extra tras guardar).
                Detalles = remaining.Select(x => new VenValeEnvaseDetalle { IdProducto = x.Detail.IdProducto, Cantidad = x.Quantity, PrecioUnitario = x.Detail.PrecioUnitario, Producto = x.Detail.Producto }).ToList() };
            context.VenValesEnvases.Add(successor);
        }
        await context.SaveChangesAsync();
        return Ok(new { MontoDevuelto = redeemedAmount, ValeSaldo = successor == null ? null : ToDto(successor) });
    }

    private Task<VenValeEnvase?> FindVoucher(string code, bool tracking = false)
    {
        var query = context.VenValesEnvases.Include(x => x.Detalles).ThenInclude(x => x.Producto).AsQueryable();
        if (!tracking) query = query.AsNoTracking();
        return query.FirstOrDefaultAsync(x => x.Codigo == code.Trim().ToUpper());
    }
    private static object ToDto(VenValeEnvase x) => new { x.Codigo, x.FechaEmision, x.FechaVencimiento, x.Estado, x.MontoOriginal,
        Productos = x.Detalles.Select(d => new { d.IdProducto, NombreProducto = d.Producto == null ? null : d.Producto.NombreProducto, d.Cantidad, d.PrecioUnitario }) };
    private static string? NormalizeMethod(string? value) => value?.Trim().ToUpperInvariant() is "EFECTIVO" or "TODOS" ? value.Trim().ToUpperInvariant() : null;
}

/// <summary>Genera códigos cortos y únicos para los vales de envases (legibles al escanear en 80mm).</summary>
public static class ReturnableVoucherCode
{
    public static async Task<string> NextAsync(SgalContext context, CancellationToken cancellationToken = default)
    {
        // "ENV" + 9 hex = 12 caracteres: suficientemente corto para escanear en Code39 a 80mm
        // y con ~6.8e10 combinaciones; se reintenta ante el improbable choque (hay índice UNIQUE).
        for (var intento = 0; intento < 12; intento++)
        {
            var code = "ENV" + Guid.NewGuid().ToString("N")[..9].ToUpperInvariant();
            if (!await context.VenValesEnvases.AnyAsync(v => v.Codigo == code, cancellationToken))
                return code;
        }
        return "ENV" + Guid.NewGuid().ToString("N")[..16].ToUpperInvariant();
    }
}

public sealed class ReturnablesConfigurationDto { public int PrecioGeneral { get; set; } public string MedioPago { get; set; } = "EFECTIVO"; public int? VigenciaDias { get; set; } public List<ReturnableProductDto> Productos { get; set; } = []; }
public sealed class ReturnableProductDto { public int IdProducto { get; set; } public int? PrecioEnvase { get; set; } public string? MedioPago { get; set; } }
public sealed class RedeemReturnablesDto { public List<ReturnedContainerDto> Productos { get; set; } = []; }
public sealed class ReturnedContainerDto { public int IdProducto { get; set; } public int Cantidad { get; set; } }
