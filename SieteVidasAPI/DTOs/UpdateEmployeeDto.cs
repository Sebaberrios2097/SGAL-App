namespace SieteVidasAPI.DTOs
{
    public class UpdateEmployeeDto
    {
        public string Nombres { get; set; } = null!;
        public string? Alias { get; set; }
        public string Apellido1 { get; set; } = null!;
        public string? Apellido2 { get; set; }
        public int? NumeroTelefono { get; set; }
        public string? Correo { get; set; }
    }
}
