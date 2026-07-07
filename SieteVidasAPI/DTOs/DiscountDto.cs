using System;

namespace SieteVidasAPI.DTOs
{
    public class DiscountDto
    {
        public int IdProducto { get; set; }
        public decimal PorcentajeDescuento { get; set; }
        public DateTime FechaInicioDescuento { get; set; }
        public DateTime? FechaTerminoDescuento { get; set; }
    }
}
