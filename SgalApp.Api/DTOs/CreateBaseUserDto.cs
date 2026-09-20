namespace SgalApp.Api.DTOs
{
    /// <summary>
    /// Datos para crear el usuario base (Desarrollador) cuando la base no tiene
    /// ningún usuario con ese rol. Solo se acepta durante el bootstrap del sistema.
    /// </summary>
    public class CreateBaseUserDto
    {
        // Datos del empleado
        public int Rut { get; set; }
        public string Dv { get; set; } = null!;
        public string Nombres { get; set; } = null!;
        public string? Alias { get; set; }
        public string Apellido1 { get; set; } = null!;
        public string? Apellido2 { get; set; }
        public int? NumeroTelefono { get; set; }
        public string? Correo { get; set; }

        // Credenciales de la cuenta
        public string NombreUsuario { get; set; } = null!;
        public string Pass { get; set; } = null!;

        // Selección comercial realizada en el primer paso del asistente.
        // Los módulos de núcleo se habilitan siempre en el servidor.
        public List<string> CodigosModulosHabilitados { get; set; } = [];
    }
}
