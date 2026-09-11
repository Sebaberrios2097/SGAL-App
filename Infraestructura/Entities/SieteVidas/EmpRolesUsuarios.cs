using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Emp_Roles_Usuarios")]
public partial class EmpRolesUsuarios
{
    [Key]
    [Column("Id_Rol_Usuario")]
    public int IdRolUsuario { get; set; }

    [Column("Nombre_Rol")]
    [StringLength(50)]
    public string NombreRol { get; set; } = null!;

    [InverseProperty("IdRolUsuarioNavigation")]
    public virtual ICollection<EmpRolesXusuario> EmpRolesXusuario { get; set; } = new List<EmpRolesXusuario>();

    public virtual ICollection<SegPermisoRol> SegPermisos { get; set; } = new List<SegPermisoRol>();
}
