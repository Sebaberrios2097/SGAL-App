namespace SieteVidasAPI.DTOs
{
    public class SaleCreateDto
    {
        public int IdTurno { get; set; }
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();
        public List<SaleItemDto> Items { get; set; } = new();
    }

    public class SalePaymentMethodDto
    {
        public int IdMetodoPago { get; set; }
        public int Monto { get; set; }
    }

    public class SaleItemDto
    {
        public int IdProducto { get; set; }
        public int Cantidad { get; set; }
        public List<SaleMaterialSelectionDto> SeleccionesMateriales { get; set; } = new();
    }

    public class SaleMaterialSelectionDto
    {
        public int IdMateriaPrimaBase { get; set; }
        public int IdMateriaPrimaSeleccionada { get; set; }
    }
}
