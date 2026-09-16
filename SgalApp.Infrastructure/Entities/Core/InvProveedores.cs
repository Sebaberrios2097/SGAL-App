using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("Inv_Proveedores")]
public partial class InvProveedores
{
    [Key]
    [Column("Id_Proveedor")]
    public int IdProveedor { get; set; }

    [Column("Nombre_Proveedor")]
    [StringLength(150)]
    public string NombreProveedor { get; set; } = null!;

    [StringLength(20)]
    public string? Rut { get; set; }

    [StringLength(250)]
    public string? Direccion { get; set; }

    [StringLength(100)]
    public string? Comuna { get; set; }

    [StringLength(100)]
    public string? Ciudad { get; set; }

    [StringLength(30)]
    public string? Telefono { get; set; }

    [StringLength(150)]
    public string? Correo { get; set; }

    [Column("Nombre_Contacto")]
    [StringLength(150)]
    public string? NombreContacto { get; set; }

    public bool Activo { get; set; }

    [InverseProperty("IdProveedorNavigation")]
    public virtual ICollection<InvOrdenCompra> InvOrdenCompra { get; set; } = new List<InvOrdenCompra>();
}
