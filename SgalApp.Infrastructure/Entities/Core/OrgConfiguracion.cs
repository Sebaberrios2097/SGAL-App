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

    /// <summary>Umbral de bajo stock por defecto de la instalación, usado cuando el producto no define el suyo.</summary>
    [Column("Stock_Minimo_Default")]
    public int StockMinimoDefault { get; set; } = 5;

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

    /// <summary>Permite que distintos usuarios mantengan turnos abiertos simultáneamente.</summary>
    [Column("Turnos_Permitir_Multiples_Activos")]
    public bool TurnosPermitirMultiplesActivos { get; set; }

    [Column("Bitacora_Incluye_Calibracion")]
    public bool BitacoraIncluyeCalibracion { get; set; } = true;

    /// <summary>Punto de venta: agrupar los productos por categoría en el catálogo.</summary>
    [Column("Pos_Agrupar_Por_Categoria")]
    public bool PosAgruparPorCategoria { get; set; } = true;

    /// <summary>Punto de venta (sin agrupar): campo de orden — nombre | precio | vendidos | stock.</summary>
    [Column("Pos_Orden_Productos"), StringLength(20)]
    public string PosOrdenProductos { get; set; } = "nombre";

    /// <summary>Punto de venta (sin agrupar): dirección de orden — asc | desc.</summary>
    [Column("Pos_Orden_Direccion"), StringLength(4)]
    public string PosOrdenDireccion { get; set; } = "asc";

    /// <summary>Punto de venta: mostrar el buscador de productos en el catálogo.</summary>
    [Column("Pos_Mostrar_Buscador")]
    public bool PosMostrarBuscador { get; set; } = true;

    /// <summary>Punto de venta: mostrar la sección de categorías (útil ocultarla si hay muchas).</summary>
    [Column("Pos_Mostrar_Categorias")]
    public bool PosMostrarCategorias { get; set; } = true;

    /// <summary>Punto de venta: permitir vender un producto aunque no tenga stock disponible.</summary>
    [Column("Pos_Permitir_Venta_Sin_Stock")]
    public bool PosPermitirVentaSinStock { get; set; }

    /// <summary>Caja: mostrar los botones de pago rápido y denominaciones al cobrar en efectivo.</summary>
    [Column("Caja_Mostrar_Botones_Efectivo")]
    public bool CajaMostrarBotonesEfectivo { get; set; } = true;

    /// <summary>Caja: el turno transversal pide apertura de efectivo y arqueo a quienes operan Caja.</summary>
    [Column("Caja_Requiere_Cuadratura")]
    public bool CajaRequiereCuadratura { get; set; } = true;

    /// <summary>Permite registrar y mostrar propinas cobradas por Caja/Point.</summary>
    [Column("Caja_Propinas_Habilitadas")]
    public bool CajaPropinasHabilitadas { get; set; }

    /// <summary>Hora local en que comienza una jornada operacional.</summary>
    [Column("Jornada_Hora_Apertura")]
    public TimeSpan JornadaHoraApertura { get; set; } = new(6, 0, 0);

    /// <summary>Hora local de cierre; si no supera a apertura corresponde al día siguiente.</summary>
    [Column("Jornada_Hora_Cierre")]
    public TimeSpan JornadaHoraCierre { get; set; } = new(2, 0, 0);

    [Column("Retornables_Precio_General")]
    public int RetornablesPrecioGeneral { get; set; }
    [Column("Retornables_Medio_Pago"), StringLength(12)]
    public string RetornablesMedioPago { get; set; } = "EFECTIVO";
    [Column("Retornables_Vigencia_Dias")]
    public int? RetornablesVigenciaDias { get; set; }

    [Column("Logo_Contenido")]
    public byte[]? LogoContenido { get; set; }

    [Column("Logo_Tipo_Contenido"), StringLength(50)]
    public string? LogoTipoContenido { get; set; }

    [Column("Logo_Nombre_Archivo"), StringLength(180)]
    public string? LogoNombreArchivo { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
}
