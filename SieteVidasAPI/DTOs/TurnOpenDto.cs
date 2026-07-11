namespace SieteVidasAPI.DTOs
{
    public class TurnOpenDto
    {
        public int IdUsuario { get; set; }
        public List<DenominationCountDto> Desglose { get; set; } = new();
    }

    public class DenominationCountDto
    {
        public int IdDenominacion { get; set; }
        public int Cantidad { get; set; }
    }
}
