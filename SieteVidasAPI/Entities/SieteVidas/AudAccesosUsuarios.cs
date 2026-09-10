using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Aud_Accesos_Usuarios")]
public partial class AudAccesosUsuarios
{
    [Key]
    [Column("Id_Acceso_Usuario")]
    public int IdAccesoUsuario { get; set; }

    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    [Column("Fecha_Acceso", TypeName = "datetime")]
    public DateTime FechaAcceso { get; set; }

    [ForeignKey("IdUsuario")]
    [InverseProperty("AudAccesosUsuarios")]
    public virtual EmpUsuarios IdUsuarioNavigation { get; set; } = null!;
}
