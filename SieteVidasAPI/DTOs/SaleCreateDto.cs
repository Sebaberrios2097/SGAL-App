using System.Collections.Generic;

namespace SieteVidasAPI.DTOs
{
    public class SaleCreateDto
    {
        public int IdTurno { get; set; }
        public int IdMetodoPago { get; set; }
        public List<SaleItemDto> Items { get; set; } = new();
    }

    public class SaleItemDto
    {
        public int IdProducto { get; set; }
        public int Cantidad { get; set; }
    }
}
