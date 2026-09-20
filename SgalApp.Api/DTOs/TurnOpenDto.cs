namespace SgalApp.Api.DTOs
{
    public class TurnOpenDto
    {
        public int IdUsuario { get; set; }

        /// <summary>Tipo de turno a abrir: 1 = vendedor (por defecto), 2 = caja.</summary>
        public byte TipoTurno { get; set; } = 1;

        public List<DenominationCountDto> Desglose { get; set; } = new();
    }

    public class DenominationCountDto
    {
        public int IdDenominacion { get; set; }
        public int Cantidad { get; set; }
    }
}
