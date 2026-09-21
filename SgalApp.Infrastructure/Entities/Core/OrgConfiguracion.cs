using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Org_Configuracion")]
public class OrgConfiguracion
{
    [Key, Column("Id_Configuracion")]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int IdConfiguracion { get; set; }

    [Column("Nombre_Comercial"), StringLength(120)]
    public string NombreComercial { get; set; } = null!;

    [Column("Razon_Social"), StringLength(180)]
    public string? RazonSocial { get; set; }

    [StringLength(300)]
    public string? Descripcion { get; set; }

    [Column("Texto_Pie_Documentos"), StringLength(250)]
    public string? TextoPieDocumentos { get; set; }

    [Column("Contacto_Publico"), StringLength(160)]
    public string? ContactoPublico { get; set; }

    [Column("Color_Primario"), StringLength(7)]
    public string ColorPrimario { get; set; } = "#1F4E5F";

    [Column("Color_Secundario"), StringLength(7)]
    public string ColorSecundario { get; set; } = "#163A47";

    [Column("Color_Acento"), StringLength(7)]
    public string ColorAcento { get; set; } = "#D97706";

    [Column("Color_Fondo"), StringLength(7)]
    public string ColorFondo { get; set; } = "#F8FAFC";

    [Column("Boleta_Muestra_Vendedor")]
    public bool BoletaMuestraVendedor { get; set; } = true;

    [Column("Boleta_Muestra_Pago")]
    public bool BoletaMuestraPago { get; set; } = true;

    [Column("Boleta_Cola_Personalizada"), StringLength(250)]
    public string? BoletaColaPersonalizada { get; set; }

    [Column("Vale_Incluye_Codigo_Barra")]
    public bool ValeIncluyeCodigoBarra { get; set; }

    [Column("Turnos_Requieren_Cuadratura")]
    public bool TurnosRequierenCuadratura { get; set; } = true;

    [Column("Bitacora_Incluye_Calibracion")]
    public bool BitacoraIncluyeCalibracion { get; set; } = true;

    [Column("Logo_Contenido")]
    public byte[]? LogoContenido { get; set; }

    [Column("Logo_Tipo_Contenido"), StringLength(50)]
    public string? LogoTipoContenido { get; set; }

    [Column("Logo_Nombre_Archivo"), StringLength(180)]
    public string? LogoNombreArchivo { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
}
