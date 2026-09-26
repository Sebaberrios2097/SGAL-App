using System.Net.Mail;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SgalApp.Api.DTOs;
using SgalApp.Api.Security;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Controllers;

/// <summary>
/// CRM básico de clientes. Diseñado con privacidad por diseño (Ley 21.719): datos personales
/// mínimos y opcionales, consentimiento de marketing separado, exportación (derecho de acceso y
/// portabilidad) y baja por anonimización (derecho de supresión) que conserva las ventas.
/// </summary>
[ApiController]
[Route("api/clientes")]
public class ClientesController : ControllerBase
{
    private static readonly string[] TiposDocumento = ["RUN", "RUT"];

    private readonly SgalContext _context;

    public ClientesController(SgalContext context)
    {
        _context = context;
    }

    [HttpGet]
    [Permission(Permissions.ClientsView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] bool includeInactive = true)
    {
        // Los clientes anonimizados no se listan: son una baja del derecho de supresión.
        var query = _context.VenClientes.AsNoTracking().Where(c => !c.Anonimizado);
        if (!includeInactive)
            query = query.Where(c => c.Activo);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var docKey = DocumentoKey(term);
            query = query.Where(c => c.Nombre.Contains(term)
                || (c.Documento != null && c.Documento.Contains(term))
                || (c.Telefono != null && c.Telefono.Contains(term))
                || (docKey.Length >= 2 && c.Documento != null
                    && c.Documento.Replace(".", "").Replace("-", "").Contains(docKey)));
        }

        var clientes = await query
            .OrderByDescending(c => c.Activo)
            .ThenBy(c => c.Nombre)
            .Take(200)
            .ToListAsync();
        return Ok(clientes.Select(ToResponse));
    }

    [HttpGet("{id:int}")]
    [Permission(Permissions.ClientsView)]
    public async Task<IActionResult> GetById(int id)
    {
        var cliente = await _context.VenClientes.AsNoTracking()
            .FirstOrDefaultAsync(c => c.IdCliente == id && !c.Anonimizado);
        if (cliente == null) return NotFound(new { mensaje = "Cliente no encontrado." });
        return Ok(ToResponse(cliente));
    }

    [HttpPost]
    [Permission(Permissions.ClientsCreate)]
    public async Task<IActionResult> Create([FromBody] ClienteSaveDto dto)
    {
        var normalized = Normalize(dto);
        var validation = await Validate(normalized);
        if (validation != null) return BadRequest(new { mensaje = validation });

        var cliente = new VenClientes { Activo = true, FechaCreacion = DateTime.UtcNow };
        Apply(cliente, normalized);
        _context.VenClientes.Add(cliente);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = cliente.IdCliente }, ToResponse(cliente));
    }

    [HttpPut("{id:int}")]
    [Permission(Permissions.ClientsEdit)]
    public async Task<IActionResult> Update(int id, [FromBody] ClienteSaveDto dto)
    {
        var cliente = await _context.VenClientes.FirstOrDefaultAsync(c => c.IdCliente == id && !c.Anonimizado);
        if (cliente == null) return NotFound(new { mensaje = "Cliente no encontrado." });

        var normalized = Normalize(dto);
        var validation = await Validate(normalized, id);
        if (validation != null) return BadRequest(new { mensaje = validation });

        Apply(cliente, normalized);
        cliente.FechaActualizacion = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Cliente actualizado.", cliente = ToResponse(cliente) });
    }

    [HttpPut("{id:int}/status")]
    [Permission(Permissions.ClientsStatusEdit)]
    public async Task<IActionResult> ToggleStatus(int id)
    {
        var cliente = await _context.VenClientes.FirstOrDefaultAsync(c => c.IdCliente == id && !c.Anonimizado);
        if (cliente == null) return NotFound(new { mensaje = "Cliente no encontrado." });

        cliente.Activo = !cliente.Activo;
        cliente.FechaActualizacion = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new
        {
            mensaje = cliente.Activo ? "Cliente activado." : "Cliente desactivado.",
            cliente = ToResponse(cliente)
        });
    }

    /// <summary>
    /// Exporta todos los datos que se conservan del cliente (derecho de acceso y portabilidad,
    /// Ley 21.719), incluyendo el conteo de ventas asociadas.
    /// </summary>
    [HttpGet("{id:int}/export")]
    [Permission(Permissions.ClientsExport)]
    public async Task<IActionResult> Export(int id)
    {
        var cliente = await _context.VenClientes.AsNoTracking()
            .FirstOrDefaultAsync(c => c.IdCliente == id && !c.Anonimizado);
        if (cliente == null) return NotFound(new { mensaje = "Cliente no encontrado." });

        var ventas = await _context.VenVentas.AsNoTracking()
            .Where(v => v.IdCliente == id)
            .OrderByDescending(v => v.FechaVenta)
            .Select(v => new { v.IdVenta, v.FechaVenta, v.MontoTotal, v.FolioDte })
            .ToListAsync();

        var datos = new
        {
            cliente.IdCliente,
            cliente.TipoDocumento,
            cliente.Documento,
            cliente.Nombre,
            cliente.Telefono,
            cliente.Correo,
            cliente.Direccion,
            cliente.AceptaMarketing,
            cliente.FechaConsentimientoMarketing,
            cliente.Activo,
            cliente.FechaCreacion,
            cliente.FechaActualizacion,
            Ventas = ventas
        };
        var nombreArchivo = $"cliente_{id}_datos.json";
        return File(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(datos,
            new System.Text.Json.JsonSerializerOptions { WriteIndented = true }),
            "application/json", nombreArchivo);
    }

    /// <summary>
    /// Ejerce el derecho de supresión (Ley 21.719): ofusca los datos personales del cliente pero
    /// conserva las ventas asociadas por la obligación tributaria de conservación.
    /// </summary>
    [HttpPost("{id:int}/anonimizar")]
    [Permission(Permissions.ClientsAnonymize)]
    public async Task<IActionResult> Anonimizar(int id)
    {
        var cliente = await _context.VenClientes.FirstOrDefaultAsync(c => c.IdCliente == id);
        if (cliente == null) return NotFound(new { mensaje = "Cliente no encontrado." });
        if (cliente.Anonimizado) return Ok(new { mensaje = "El cliente ya estaba anonimizado." });

        cliente.Nombre = "(cliente anonimizado)";
        cliente.TipoDocumento = null;
        cliente.Documento = null;
        cliente.Telefono = null;
        cliente.Correo = null;
        cliente.Direccion = null;
        cliente.AceptaMarketing = false;
        cliente.FechaConsentimientoMarketing = null;
        cliente.Activo = false;
        cliente.Anonimizado = true;
        cliente.FechaAnonimizacion = DateTime.UtcNow;
        cliente.FechaActualizacion = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { mensaje = "Cliente anonimizado. Sus ventas se conservan sin datos personales." });
    }

    // ---- Helpers ----

    private sealed record NormalizedCliente(
        string? TipoDocumento, string? Documento, string Nombre,
        string? Telefono, string? Correo, string? Direccion, bool AceptaMarketing);

    private static NormalizedCliente Normalize(ClienteSaveDto dto)
    {
        var documento = string.IsNullOrWhiteSpace(dto.Documento) ? null : NormalizeDocumento(dto.Documento);
        var tipo = dto.TipoDocumento?.Trim().ToUpperInvariant();
        if (documento == null) tipo = null; // Sin documento no hay tipo asociado.
        return new NormalizedCliente(
            tipo,
            documento,
            string.Join(' ', (dto.Nombre ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)),
            string.IsNullOrWhiteSpace(dto.Telefono) ? null : dto.Telefono.Trim(),
            string.IsNullOrWhiteSpace(dto.Correo) ? null : dto.Correo.Trim().ToLowerInvariant(),
            string.IsNullOrWhiteSpace(dto.Direccion) ? null : dto.Direccion.Trim(),
            dto.AceptaMarketing);
    }

    private async Task<string?> Validate(NormalizedCliente c, int? currentId = null)
    {
        if (string.IsNullOrWhiteSpace(c.Nombre)) return "El nombre del cliente es obligatorio.";
        if (c.Nombre.Length > 150) return "El nombre no puede superar los 150 caracteres.";
        if (c.Documento != null)
        {
            if (c.Documento.Length > 12) return "El documento no tiene un formato válido.";
            if (c.TipoDocumento != null && !TiposDocumento.Contains(c.TipoDocumento))
                return "El tipo de documento debe ser RUN o RUT.";
            var duplicado = await _context.VenClientes.AnyAsync(x =>
                x.IdCliente != currentId && !x.Anonimizado && x.Documento == c.Documento);
            if (duplicado) return "Ya existe un cliente con ese documento.";
        }
        if (c.Telefono?.Length > 20) return "El teléfono no puede superar los 20 caracteres.";
        if (c.Direccion?.Length > 200) return "La dirección no puede superar los 200 caracteres.";
        if (c.Correo != null)
        {
            if (c.Correo.Length > 150) return "El correo no puede superar los 150 caracteres.";
            if (!MailAddress.TryCreate(c.Correo, out _)) return "El correo no tiene un formato válido.";
        }
        return null;
    }

    private static void Apply(VenClientes cliente, NormalizedCliente c)
    {
        cliente.TipoDocumento = c.TipoDocumento;
        cliente.Documento = c.Documento;
        cliente.Nombre = c.Nombre;
        cliente.Telefono = c.Telefono;
        cliente.Correo = c.Correo;
        cliente.Direccion = c.Direccion;
        // El consentimiento de marketing sella su fecha cuando pasa a verdadero.
        if (c.AceptaMarketing && !cliente.AceptaMarketing)
            cliente.FechaConsentimientoMarketing = DateTime.UtcNow;
        else if (!c.AceptaMarketing)
            cliente.FechaConsentimientoMarketing = null;
        cliente.AceptaMarketing = c.AceptaMarketing;
    }

    private static object ToResponse(VenClientes c) => new
    {
        c.IdCliente,
        c.TipoDocumento,
        c.Documento,
        c.Nombre,
        c.Telefono,
        c.Correo,
        c.Direccion,
        c.AceptaMarketing,
        c.Activo
    };

    private static string DocumentoKey(string documento) =>
        documento.Replace(".", "").Replace("-", "").Replace(" ", "").ToUpperInvariant();

    /// <summary>Normaliza el RUN/RUT a la forma con guion (cuerpo-dígito verificador).</summary>
    private static string NormalizeDocumento(string documento)
    {
        var key = DocumentoKey(documento.Trim());
        if (key.Length < 2) return key;
        return $"{key[..^1]}-{key[^1]}";
    }
}
