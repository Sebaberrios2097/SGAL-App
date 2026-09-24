using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using SgalApp.Api.DTOs;
using SgalApp.Infrastructure.Context;
using SgalApp.Infrastructure.Entities;

namespace SgalApp.Api.Services.Dte;

/// <summary>Resuelve y actualiza receptores de factura sin duplicarlos por formato de RUT.</summary>
public static class DteCustomerResolver
{
    public static async Task<SiiClientesEmpresa> UpsertAsync(
        SgalContext context,
        FacturaReceptorDto receptor,
        CancellationToken cancellationToken = default)
    {
        var normalizedRut = NormalizeRut(receptor.Rut);
        var rutKey = RutKey(normalizedRut);

        SiiClientesEmpresa? clientById = null;
        if (receptor.IdClienteEmpresa is > 0)
            clientById = await context.SiiClientesEmpresa
                .FirstOrDefaultAsync(item => item.IdClienteEmpresa == receptor.IdClienteEmpresa.Value, cancellationToken);

        // El RUT prevalece sobre el identificador recibido. Esto también cubre un selector que
        // quedó abierto mientras una migración consolidaba clientes duplicados.
        var clientByRut = await context.SiiClientesEmpresa
            .FirstOrDefaultAsync(item => item.RutEmpresa == normalizedRut, cancellationToken);
        clientByRut ??= await context.SiiClientesEmpresa.FirstOrDefaultAsync(item =>
                item.RutEmpresa.Replace(".", "").Replace("-", "").Replace(" ", "").ToUpper() == rutKey,
            cancellationToken);

        var client = clientByRut ?? clientById ?? new SiiClientesEmpresa();
        ApplyReceptor(client, receptor, normalizedRut);

        var isNew = client.IdClienteEmpresa == 0;
        if (isNew)
            context.SiiClientesEmpresa.Add(client);

        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return client;
        }
        catch (DbUpdateException exception) when (IsUniqueRutViolation(exception))
        {
            // Dos solicitudes pueden consultar simultáneamente y competir por crear el mismo
            // RUT. El índice decide cuál gana; la otra reutiliza el registro recién insertado.
            context.Entry(client).State = EntityState.Detached;
            var existing = await context.SiiClientesEmpresa
                .FirstAsync(item => item.RutEmpresa == normalizedRut, cancellationToken);
            ApplyReceptor(existing, receptor, normalizedRut);
            await context.SaveChangesAsync(cancellationToken);
            return existing;
        }
    }

    private static void ApplyReceptor(SiiClientesEmpresa client, FacturaReceptorDto receptor, string normalizedRut)
    {
        client.RutEmpresa = normalizedRut;
        client.RazonSocial = receptor.RazonSocial.Trim();
        client.Giro = receptor.Giro.Trim();
        client.DireccionLegal = receptor.Direccion.Trim();
        client.Comuna = receptor.Comuna.Trim();
        client.Ciudad = receptor.Ciudad?.Trim() ?? string.Empty;
        client.Correo = string.IsNullOrWhiteSpace(receptor.Correo) ? null : receptor.Correo.Trim();
    }

    private static bool IsUniqueRutViolation(Exception exception)
    {
        for (Exception? current = exception; current != null; current = current.InnerException)
            if (current is SqlException { Number: 2601 or 2627 } sqlException
                && sqlException.Message.Contains("UX_SII_Clientes_Empresa_Rut", StringComparison.Ordinal))
                return true;
        return false;
    }

    private static string RutKey(string rut) => rut.Replace(".", "").Replace("-", "").Replace(" ", "").ToUpperInvariant();

    private static string NormalizeRut(string rut)
    {
        var key = RutKey(rut?.Trim() ?? string.Empty);
        if (key.Length < 2) return key;
        return $"{key[..^1]}-{key[^1]}";
    }
}
