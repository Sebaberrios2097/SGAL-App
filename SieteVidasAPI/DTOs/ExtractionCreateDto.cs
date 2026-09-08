namespace SieteVidasAPI.DTOs
{
    public class ExtractionBatchCreateDto
    {
        public int IdUsuario { get; set; }
        public int IdTurno { get; set; }
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
