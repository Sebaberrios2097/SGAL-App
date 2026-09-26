using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Cliente del CRM básico: persona o empresa que puede asignarse a una venta. Es distinto del
/// receptor de factura (<see cref="SiiClientesEmpresa"/>), que conserva los datos tributarios.
/// Diseñado con privacidad por diseño (Ley 21.719): datos personales mínimos y opcionales,
/// consentimiento de marketing separado, y baja por anonimización en vez de borrado físico.
/// </summary>
[Table("Ven_Clientes")]
public partial class VenClientes
{
    [Key]
    [Column("Id_Cliente")]
    public int IdCliente { get; set; }

    /// <summary>Tipo de documento: "RUN" (persona), "RUT" (empresa) o null (sin documento).</summary>
    [Column("Tipo_Documento")]
    [StringLength(10)]
    public string? TipoDocumento { get; set; }

    /// <summary>RUN/RUT normalizado con guion. Opcional (minimización de datos).</summary>
    [StringLength(12)]
    public string? Documento { get; set; }

    /// <summary>Nombre de la persona o razón social. Único dato obligatorio.</summary>
    [StringLength(150)]
    public string Nombre { get; set; } = null!;

    [StringLength(20)]
    public string? Telefono { get; set; }

    [StringLength(150)]
    public string? Correo { get; set; }

    [StringLength(200)]
    public string? Direccion { get; set; }

    /// <summary>Consentimiento explícito para comunicaciones de marketing (Ley 21.719).</summary>
    [Column("Acepta_Marketing")]
    public bool AceptaMarketing { get; set; }

    [Column("Fecha_Consentimiento_Marketing")]
    public DateTime? FechaConsentimientoMarketing { get; set; }

    public bool Activo { get; set; } = true;

    /// <summary>Baja por derecho de supresión: los datos personales quedan ofuscados.</summary>
    public bool Anonimizado { get; set; }

    [Column("Fecha_Anonimizacion")]
    public DateTime? FechaAnonimizacion { get; set; }

    [Column("Fecha_Creacion")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime? FechaActualizacion { get; set; }

    [InverseProperty("IdClienteNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
