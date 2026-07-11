namespace SieteVidasAPI.DTOs
{
    public class TurnCloseDto
    {
        public int IdTurno { get; set; }
        public List<DenominationCountDto> DesgloseEfectivo { get; set; } = new();
        public List<MethodCloseDto> DesgloseOtrosMetodos { get; set; } = new();
        public int? ObservacionCierre { get; set; }
    }

    public class MethodCloseDto
    {
        public int IdMetodoPago { get; set; }
        public int MontoReal { get; set; }
    }
}
