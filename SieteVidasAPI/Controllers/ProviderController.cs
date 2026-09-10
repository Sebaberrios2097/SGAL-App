using System.Net.Mail;
using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;

namespace SieteVidasAPI.Controllers;

[ApiController]
[Route("api/providers")]
public class ProviderController : ControllerBase
{
    private readonly SieteVidasContext _context;

    public ProviderController(SieteVidasContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var providers = await _context.InvProveedores.AsNoTracking()
            .OrderByDescending(x => x.Activo)
            .ThenBy(x => x.NombreProveedor)
            .Select(x => new
            {
                x.IdProveedor,
                x.NombreProveedor,
                x.Rut,
                x.Direccion,
                x.Comuna,
                x.Ciudad,
                x.Telefono,
                x.Correo,
                x.NombreContacto,
                x.Activo,
                CantidadOrdenes = x.InvOrdenCompra.Count,
                OrdenesAbiertas = x.InvOrdenCompra.Count(order =>
                    order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra == "Borrador"
                    || order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra == "Emitida")
            })
            .ToListAsync();

        return Ok(providers);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ProviderSaveDto dto)
    {
        if (!await IsAdministrator(dto.IdUsuario)) return Forbid();
        var name = NormalizeName(dto.NombreProveedor);
        var validation = await Validate(dto, name);
        if (validation != null) return BadRequest(new { mensaje = validation });

        var provider = new InvProveedores
        {
            NombreProveedor = name!,
            Activo = true
        };
        ApplyDetails(provider, dto);
        _context.InvProveedores.Add(provider);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { provider.IdProveedor }, ToResponse(provider));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] ProviderSaveDto dto)
    {
        if (!await IsAdministrator(dto.IdUsuario)) return Forbid();
        var provider = await _context.InvProveedores.FindAsync(id);
        if (provider == null) return NotFound(new { mensaje = "Proveedor no encontrado." });

        var name = NormalizeName(dto.NombreProveedor);
        var validation = await Validate(dto, name, id);
        if (validation != null) return BadRequest(new { mensaje = validation });

        provider.NombreProveedor = name!;
        ApplyDetails(provider, dto);
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Proveedor actualizado.", proveedor = ToResponse(provider) });
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> ToggleStatus(int id, [FromBody] ProviderStatusDto dto)
    {
        if (!await IsAdministrator(dto.IdUsuario)) return Forbid();
        var provider = await _context.InvProveedores.FindAsync(id);
        if (provider == null) return NotFound(new { mensaje = "Proveedor no encontrado." });

        if (provider.Activo)
        {
            var hasOpenOrders = await _context.InvOrdenCompra.AnyAsync(order =>
                order.IdProveedor == id
                && (order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra == "Borrador"
                    || order.IdEstadoOrdenCompraNavigation.NombreEstadoOrdenCompra == "Emitida"));
            if (hasOpenOrders)
                return Conflict(new { mensaje = "No se puede desactivar un proveedor con órdenes en borrador o emitidas." });
        }

        provider.Activo = !provider.Activo;
        await _context.SaveChangesAsync();
        return Ok(new
        {
            mensaje = provider.Activo ? "Proveedor activado." : "Proveedor desactivado.",
            proveedor = ToResponse(provider)
        });
    }

    private async Task<string?> Validate(ProviderSaveDto dto, string? name, int? currentId = null)
    {
        if (string.IsNullOrWhiteSpace(name)) return "El nombre del proveedor es obligatorio.";
        if (name.Length > 150) return "El nombre del proveedor no puede superar los 150 caracteres.";
        if (dto.Rut?.Trim().Length > 20) return "El RUT no puede superar los 20 caracteres.";
        if (dto.Direccion?.Trim().Length > 250) return "La dirección no puede superar los 250 caracteres.";
        if (dto.Comuna?.Trim().Length > 100 || dto.Ciudad?.Trim().Length > 100)
            return "La comuna y la ciudad no pueden superar los 100 caracteres.";
        if (dto.Telefono?.Trim().Length > 30) return "El teléfono no puede superar los 30 caracteres.";
        if (dto.Correo?.Trim().Length > 150) return "El correo no puede superar los 150 caracteres.";
        if (!string.IsNullOrWhiteSpace(dto.Correo) && !MailAddress.TryCreate(dto.Correo.Trim(), out _))
            return "El correo del proveedor no tiene un formato válido.";
        if (dto.NombreContacto?.Trim().Length > 150)
            return "El nombre de contacto no puede superar los 150 caracteres.";

        var normalized = name.ToUpper();
        var exists = await _context.InvProveedores.AnyAsync(x =>
            x.IdProveedor != currentId && x.NombreProveedor.ToUpper() == normalized);
        if (exists) return "Ya existe un proveedor con ese nombre.";

        if (!string.IsNullOrWhiteSpace(dto.Rut))
        {
            var normalizedRut = dto.Rut.Trim().ToUpper();
            var rutExists = await _context.InvProveedores.AnyAsync(x =>
                x.IdProveedor != currentId && x.Rut != null && x.Rut.ToUpper() == normalizedRut);
            if (rutExists) return "Ya existe un proveedor con ese RUT.";
        }

        return null;
    }

    private async Task<bool> IsAdministrator(int userId) => userId > 0 && await _context.EmpRolesXusuario
        .AnyAsync(x => x.IdUsuario == userId && x.Activo && x.IdUsuarioNavigation.Activo
            && x.IdRolUsuarioNavigation.NombreRol.ToUpper() == "ADMINISTRADOR");

    private static string? NormalizeName(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : string.Join(' ', value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries));

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void ApplyDetails(InvProveedores provider, ProviderSaveDto dto)
    {
        provider.Rut = NormalizeOptional(dto.Rut);
        provider.Direccion = NormalizeOptional(dto.Direccion);
        provider.Comuna = NormalizeOptional(dto.Comuna);
        provider.Ciudad = NormalizeOptional(dto.Ciudad);
        provider.Telefono = NormalizeOptional(dto.Telefono);
        provider.Correo = NormalizeOptional(dto.Correo)?.ToLowerInvariant();
        provider.NombreContacto = NormalizeOptional(dto.NombreContacto);
    }

    private static object ToResponse(InvProveedores provider) => new
    {
        provider.IdProveedor,
        provider.NombreProveedor,
        provider.Rut,
        provider.Direccion,
        provider.Comuna,
        provider.Ciudad,
        provider.Telefono,
        provider.Correo,
        provider.NombreContacto,
        provider.Activo
    };
}
