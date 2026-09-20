using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Configuracion_Cortesia")]
public partial class InvConfiguracionCortesia
{
    [Key]
    [Column("Id_Configuracion")]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int IdConfiguracion { get; set; }

    /// <summary>Modo de la cortesía diaria: "PRODUCTOS" (unidades de productos específicos)
    /// o "MONTO" (un tope diario en dinero elegible por categorías).</summary>
    [Column("Modo")]
    [StringLength(10)]
    public string Modo { get; set; } = CourtesyModes.Products;

    /// <summary>Cupo diario en unidades para el modo "PRODUCTOS".</summary>
    [Column("Limite_Diario_Global")]
    public int LimiteDiarioGlobal { get; set; }

    /// <summary>Cupo diario en dinero para el modo "MONTO".</summary>
    [Column("Monto_Diario_Global")]
    public int MontoDiarioGlobal { get; set; }

    [Column("Fecha_Modificacion", TypeName = "datetime2")]
    public DateTime FechaModificacion { get; set; }
}

/// <summary>Valores válidos para <see cref="InvConfiguracionCortesia.Modo"/>.</summary>
public static class CourtesyModes
{
    public const string Products = "PRODUCTOS";
    public const string Money = "MONTO";

    public static bool IsValid(string? modo) => modo is Products or Money;
}
