using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Datos del emisor (contribuyente) para la emisión de DTE. Es una tabla de fila única
/// (Id fijo), porque cada instalación de SGAL-App maneja un solo RUT. La API de LibreDTE Core
/// es sin estado: SGAL-App guarda aquí el certificado (con su clave cifrada) y los datos del
/// emisor, y los envía en cada emisión; los folios se gestionan en SiiCafFolios y el correo lo
/// envía SGAL-App con la configuración SMTP de esta tabla.
/// </summary>
[Table("SII_Emisor")]
public partial class SiiEmisor
{
    [Key]
    [Column("Id_Emisor")]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int IdEmisor { get; set; }

    /// <summary>RUT del emisor con guion y dígito verificador.</summary>
    [Column("Rut")]
    [StringLength(12)]
    public string Rut { get; set; } = null!;

    [Column("Razon_Social")]
    [StringLength(180)]
    public string RazonSocial { get; set; } = null!;

    /// <summary>Actividad económica (giro) obligatoria para el DTE.</summary>
    [StringLength(120)]
    public string Giro { get; set; } = null!;

    [Column("Direccion")]
    [StringLength(150)]
    public string Direccion { get; set; } = null!;

    [StringLength(60)]
    public string Comuna { get; set; } = null!;

    [StringLength(60)]
    public string Ciudad { get; set; } = null!;

    /// <summary>Código de actividad económica (acteco) del SII.</summary>
    [Column("Acteco")]
    public int? Acteco { get; set; }

    /// <summary>Número de la resolución del SII que autoriza la emisión electrónica.</summary>
    [Column("Resolucion_Numero")]
    public int? ResolucionNumero { get; set; }

    /// <summary>Año/fecha de la resolución del SII.</summary>
    [Column("Resolucion_Fecha")]
    public DateOnly? ResolucionFecha { get; set; }

    /// <summary>Ambiente activo: "certificacion" (maullin) o "produccion" (palena).</summary>
    [Column("Ambiente")]
    [StringLength(20)]
    public string Ambiente { get; set; } = "certificacion";

    /// <summary>
    /// Fase de puesta en marcha: "desarrollo" (timbre local con datos ficticios, sin enviar al
    /// SII — permite usar la app sin certificado), "certificacion" (envía a maullin para el Set
    /// de Pruebas) o "produccion" (envía a palena; ya autorizado por el SII).
    /// </summary>
    [Column("Fase")]
    [StringLength(20)]
    public string Fase { get; set; } = "desarrollo";

    /// <summary>URL base del microservicio LibreDTE que firma y envía al SII.</summary>
    [Column("Libredte_Url")]
    [StringLength(250)]
    public string? LibredteUrl { get; set; }

    /// <summary>Nombre del archivo del certificado cargado (solo referencia).</summary>
    [Column("Certificado_Nombre")]
    [StringLength(180)]
    public string? CertificadoNombre { get; set; }

    /// <summary>Contenido del certificado digital (.p12/.pfx) que SGAL-App envía a LibreDTE al emitir.</summary>
    [Column("Certificado_Pfx")]
    public byte[]? CertificadoPfx { get; set; }

    /// <summary>Clave del certificado, cifrada con Data Protection (nunca en texto plano).</summary>
    [Column("Certificado_Clave_Protegida")]
    public string? CertificadoClaveProtegida { get; set; }

    [Column("Smtp_Host")]
    [StringLength(150)]
    public string? SmtpHost { get; set; }

    [Column("Smtp_Puerto")]
    public int? SmtpPuerto { get; set; }

    [Column("Smtp_Usuario")]
    [StringLength(150)]
    public string? SmtpUsuario { get; set; }

    /// <summary>Clave SMTP, cifrada con Data Protection.</summary>
    [Column("Smtp_Clave_Protegida")]
    public string? SmtpClaveProtegida { get; set; }

    /// <summary>Dirección de correo remitente de las facturas.</summary>
    [Column("Correo_Remitente")]
    [StringLength(150)]
    public string? CorreoRemitente { get; set; }

    /// <summary>Enviar la factura por correo automáticamente al emitirla (SGAL-App realiza el envío).</summary>
    [Column("Envio_Automatico_Correo")]
    public bool EnvioAutomaticoCorreo { get; set; } = true;

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
}
