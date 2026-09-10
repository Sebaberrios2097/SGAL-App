using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("SII_Estados_Boleta")]
public partial class SiiEstadosBoleta
{
    [Key]
    [Column("Id_Estado_Boleta")]
    public int IdEstadoBoleta { get; set; }

    [Column("Nombre_Estado_Boleta")]
    [StringLength(50)]
    public string NombreEstadoBoleta { get; set; } = null!;

    [InverseProperty("IdEstadoBoletaNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
