using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SgalApp.Infrastructure.Entities;

/// <summary>
/// Terminal/máquina POS configurada por el Desarrollador. Las credenciales sensibles se
/// almacenan cifradas (Data Protection); los demás valores en claro.
/// </summary>
[Table("Int_Maquinas_POS")]
public class IntMaquinaPos
{
    [Key, Column("Id_Maquina")]
    public int IdMaquina { get; set; }

    [Column("Proveedor"), StringLength(40)]
    public string Proveedor { get; set; } = null!;

    [Column("Nombre"), StringLength(120)]
    public string Nombre { get; set; } = null!;

    [Column("Activa")]
    public bool Activa { get; set; } = true;

    [Column("Access_Token_Cifrado")]
    public string? AccessTokenCifrado { get; set; }

    [Column("Webhook_Secret_Cifrado")]
    public string? WebhookSecretCifrado { get; set; }

    [Column("Terminal_Id"), StringLength(120)]
    public string? TerminalId { get; set; }

    [Column("Base_Url"), StringLength(200)]
    public string? BaseUrl { get; set; }

    [Column("Print_On_Terminal"), StringLength(40)]
    public string? PrintOnTerminal { get; set; }

    [Column("Payer_Condition"), StringLength(60)]
    public string? PayerCondition { get; set; }

    [Column("Expiration_Time"), StringLength(20)]
    public string? ExpirationTime { get; set; }

    [Column("Permite_Simulacion")]
    public bool PermiteSimulacion { get; set; }

    [Column("Auto_Simular")]
    public bool AutoSimular { get; set; }

    [Column("Fecha_Creacion")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Actualizacion")]
    public DateTime FechaActualizacion { get; set; }
}
