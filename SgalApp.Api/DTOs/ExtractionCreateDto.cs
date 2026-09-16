namespace SgalApp.Api.DTOs
{
    public class ExtractionBatchCreateDto
    {
        public int IdUsuario { get; set; }
        public int IdTurno { get; set; }

        /// <summary>
        /// Materia prima (café) que descuenta stock para toda la tanda. Si no se envía,
        /// se usa el café marcado como calibrable. Null si no hay ninguno configurado.
        /// </summary>
        public int? IdMateriaPrima { get; set; }
        public List<ExtractionCreateDto> Extracciones { get; set; } = new();
    }

    public class ExtractionCreateDto
    {
        public double Gramos { get; set; }
        public int Segundos { get; set; }
        public double Mililitros { get; set; }
        public string? Observaciones { get; set; }
    }

    public class LogbookObservationUpdateDto
    {
        public int IdUsuario { get; set; }
        public int IdTurno { get; set; }
        public string? Observaciones { get; set; }
    }
}
