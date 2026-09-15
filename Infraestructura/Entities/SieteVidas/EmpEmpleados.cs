using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Entities.SieteVidas;

[Table("Emp_Empleados")]
public partial class EmpEmpleados
{
    [Key]
    [Column("Id_Empleado")]
    public int IdEmpleado { get; set; }

    [Column("Id_Usuario")]
    public int? IdUsuario { get; set; }

    public int Rut { get; set; }

    [StringLength(1)]
    [Unicode(false)]
    public string Dv { get; set; } = null!;

    /// <summary>
    /// Distingue empleados de la cafetería (false) de "externos" (true) que también acceden al
    /// sistema con sus roles pero no forman parte del personal.
    /// </summary>
    [Column("Es_Externo")]
    public bool EsExterno { get; set; }

    /// <summary>Tipo de documento del identificador: "RUN" persona natural, "RUT" empresa.</summary>
    [Column("Tipo_Documento")]
    [StringLength(3)]
    [Unicode(false)]
    public string TipoDocumento { get; set; } = "RUN";

    [StringLength(100)]
    public string Nombres { get; set; } = null!;

    [StringLength(50)]
    public string? Alias { get; set; }

    [Column("Apellido_1")]
    [StringLength(50)]
    public string Apellido1 { get; set; } = null!;

    [Column("Apellido_2")]
    [StringLength(50)]
    public string? Apellido2 { get; set; }

    [Column("Numero_Telefono")]
    public int? NumeroTelefono { get; set; }

    [StringLength(150)]
    public string? Correo { get; set; }

    [Column("Fecha_Ingreso")]
    public DateOnly FechaIngreso { get; set; }

    [Column("Fecha_Salida")]
    public DateOnly? FechaSalida { get; set; }

    /// <summary>
    /// Solo puede haber un rut activo a la vez. Si se desactiva y se necesita volver a registrar al mismo empleado, se debe crear un nuevo registro.
    /// </summary>
    public bool Activo { get; set; }

    [ForeignKey("IdUsuario")]
    [InverseProperty("EmpEmpleados")]
    public virtual EmpUsuarios? IdUsuarioNavigation { get; set; }
}
