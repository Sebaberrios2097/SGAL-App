namespace SieteVidasAPI.DTOs
{
    public class CreateEmployeeDto
    {
        public int Rut { get; set; }
        public string Dv { get; set; } = null!;
        public string Nombres { get; set; } = null!;
        public string? Alias { get; set; }
        public string Apellido1 { get; set; } = null!;
        public string? Apellido2 { get; set; }
        public int? NumeroTelefono { get; set; }
        public string? Correo { get; set; }

        /// <summary>true = externo, false = empleado de la cafetería.</summary>
        public bool EsExterno { get; set; }

        /// <summary>"RUN" persona natural, "RUT" empresa.</summary>
        public string TipoDocumento { get; set; } = "RUN";
    }
}
