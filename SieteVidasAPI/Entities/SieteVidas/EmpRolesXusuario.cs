using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SieteVidasAPI.Entities.SieteVidas;

[Table("Emp_RolesXUsuario")]
public partial class EmpRolesXusuario
{
    [Key]
    [Column("Id_RolXUsuario")]
    public int IdRolXusuario { get; set; }

    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    [Column("Id_Rol_Usuario")]
    public int IdRolUsuario { get; set; }

    /// <summary>
    /// Al igual que el empleado, si un usuario se desactiva y necesita volver a crear se debe crear un registro nuevo.
    /// </summary>
    public bool Activo { get; set; }

    [Column("Fecha_Asignacion", TypeName = "datetime")]
    public DateTime FechaAsignacion { get; set; }

    [Column("Fecha_Desactivacion", TypeName = "datetime")]
    public DateTime? FechaDesactivacion { get; set; }

    [ForeignKey("IdRolUsuario")]
    [InverseProperty("EmpRolesXusuario")]
    public virtual EmpRolesUsuarios IdRolUsuarioNavigation { get; set; } = null!;

    [ForeignKey("IdUsuario")]
    [InverseProperty("EmpRolesXusuario")]
    public virtual EmpUsuarios IdUsuarioNavigation { get; set; } = null!;
}
