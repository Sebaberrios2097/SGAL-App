namespace SieteVidasAPI.DTOs
{
    public class CreateEmployeeDto
    {
        public int Rut { get; set; }
        public string Dv { get; set; } = null!;
        public string Nombres { get; set; } = null!;
        public string Apellido1 { get; set; } = null!;
        public string? Apellido2 { get; set; }
        public int? NumeroTelefono { get; set; }
        public string? Correo { get; set; }
    }
}
