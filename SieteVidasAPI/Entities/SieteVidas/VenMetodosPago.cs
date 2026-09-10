using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Ven_Metodos_Pago")]
public partial class VenMetodosPago
{
    [Key]
    [Column("Id_Metodo_Pago")]
    public int IdMetodoPago { get; set; }

    [Column("Nombre_Metodo_Pago")]
    [StringLength(50)]
    public string NombreMetodoPago { get; set; } = null!;

    [InverseProperty("IdMetodoPagoNavigation")]
    public virtual ICollection<TurTurnoDesglose> TurTurnoDesglose { get; set; } = new List<TurTurnoDesglose>();

    [InverseProperty("IdMetodoPagoNavigation")]
    public virtual ICollection<VenMetodosPagoVenta> VenMetodosPagoVenta { get; set; } = new List<VenMetodosPagoVenta>();
}
