using System.ComponentModel.DataAnnotations;

namespace SgalApp.Api.DTOs.Dte;

/// <summary>Datos del emisor para configurar la emisión de DTE (sin secretos).</summary>
public sealed class UpdateEmisorDto
{
    [Required, StringLength(12)]
    public string Rut { get; set; } = string.Empty;

    [Required, StringLength(180)]
    public string RazonSocial { get; set; } = string.Empty;

    [Required, StringLength(120)]
    public string Giro { get; set; } = string.Empty;

    [Required, StringLength(150)]
    public string Direccion { get; set; } = string.Empty;

    [Required, StringLength(60)]
    public string Comuna { get; set; } = string.Empty;

    [Required, StringLength(60)]
    public string Ciudad { get; set; } = string.Empty;

    public int? Acteco { get; set; }

    public int? ResolucionNumero { get; set; }

    public DateOnly? ResolucionFecha { get; set; }

    /// <summary>"certificacion" (maullin) o "produccion" (palena).</summary>
    [Required, StringLength(20)]
    public string Ambiente { get; set; } = "certificacion";

    /// <summary>Fase de puesta en marcha: "desarrollo", "certificacion" o "produccion".</summary>
    [Required, StringLength(20)]
    public string Fase { get; set; } = "desarrollo";

    [StringLength(250)]
    public string? LibredteUrl { get; set; }

    [StringLength(150)]
    public string? SmtpHost { get; set; }

    public int? SmtpPuerto { get; set; }

    [StringLength(150)]
    public string? SmtpUsuario { get; set; }

    /// <summary>Clave SMTP en texto plano; se cifra al guardar. Vacío = conservar la actual.</summary>
    public string? SmtpClave { get; set; }

    [EmailAddress, StringLength(150)]
    public string? CorreoRemitente { get; set; }

    /// <summary>Enviar la factura por correo al emitir (SGAL-App realiza el envío).</summary>
    public bool EnvioAutomaticoCorreo { get; set; } = true;
}

/// <summary>Vista de la configuración del emisor devuelta al frontend.</summary>
public sealed class EmisorDto
{
    public string Rut { get; set; } = string.Empty;
    public string RazonSocial { get; set; } = string.Empty;
    public string Giro { get; set; } = string.Empty;
    public string Direccion { get; set; } = string.Empty;
    public string Comuna { get; set; } = string.Empty;
    public string Ciudad { get; set; } = string.Empty;
    public int? Acteco { get; set; }
    public int? ResolucionNumero { get; set; }
    public DateOnly? ResolucionFecha { get; set; }
    public string Ambiente { get; set; } = "certificacion";
    public string Fase { get; set; } = "desarrollo";
    public string? LibredteUrl { get; set; }
    public bool CertificadoCargado { get; set; }
    public string? CertificadoNombre { get; set; }
    public string? SmtpHost { get; set; }
    public int? SmtpPuerto { get; set; }
    public string? SmtpUsuario { get; set; }
    public bool SmtpClaveConfigurada { get; set; }
    public string? CorreoRemitente { get; set; }
    public bool EnvioAutomaticoCorreo { get; set; }
    public List<CafResumenDto> Folios { get; set; } = [];
    public DteEstadoPuestaEnMarchaDto EstadoPuestaEnMarcha { get; set; } = new();
}

/// <summary>Resumen de folios (CAF) cargados por tipo de documento.</summary>
public sealed class CafResumenDto
{
    public int TipoDte { get; set; }
    public string NombreDte { get; set; } = string.Empty;
    public int FolioDesde { get; set; }
    public int FolioHasta { get; set; }
    public int UltimoFolioUtilizado { get; set; }
    public int Disponibles { get; set; }
    public bool EsPrueba { get; set; }
}

public sealed class DteEstadoPuestaEnMarchaDto
{
    public string Fase { get; set; } = "desarrollo";
    public string Titulo { get; set; } = "Desarrollo local";
    public string Descripcion { get; set; } = string.Empty;
    public bool ConexionLibreDte { get; set; }
    public bool DatosEmisorCompletos { get; set; }
    public bool CertificadoRealCargado { get; set; }
    public bool CafRealesCargados { get; set; }
    public bool ResolucionConfigurada { get; set; }
    public bool PuedeEnviarAlSii { get; set; }
    public int Pendientes { get; set; }
    public int LocalesPrueba { get; set; }
    public int Enviados { get; set; }
    public int Aceptados { get; set; }
    public int Rechazados { get; set; }
}
