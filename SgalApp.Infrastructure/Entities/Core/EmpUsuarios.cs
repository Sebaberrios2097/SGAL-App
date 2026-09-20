using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Emp_Usuarios")]
public partial class EmpUsuarios
{
    [Key]
    [Column("Id_Usuario")]
    public int IdUsuario { get; set; }

    [Column("Nombre_Usuario")]
    [StringLength(50)]
    public string NombreUsuario { get; set; } = null!;

    [MaxLength(32)]
    public byte[] Pass { get; set; } = null!;

    public bool Activo { get; set; }

    [Column("Fecha_Creacion", TypeName = "datetime")]
    public DateTime FechaCreacion { get; set; }

    [Column("Fecha_Desactivacion", TypeName = "datetime")]
    public DateTime? FechaDesactivacion { get; set; }

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<AudAccesosUsuarios> AudAccesosUsuarios { get; set; } = new List<AudAccesosUsuarios>();

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<EmpEmpleados> EmpEmpleados { get; set; } = new List<EmpEmpleados>();

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<EmpRolesXusuario> EmpRolesXusuario { get; set; } = new List<EmpRolesXusuario>();

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<InvOrdenCompra> InvOrdenCompra { get; set; } = new List<InvOrdenCompra>();

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<TurTurno> TurTurno { get; set; } = new List<TurTurno>();

    [InverseProperty("IdUsuarioNavigation")]
    public virtual ICollection<VenVentas> VenVentas { get; set; } = new List<VenVentas>();
}
