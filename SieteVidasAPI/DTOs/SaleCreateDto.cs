namespace SieteVidasAPI.DTOs
{
    public class SaleCreateDto
    {
        public int IdTurno { get; set; }
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();
        public List<SaleItemDto> Items { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al total (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }
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

        /// <summary>Ingredientes extra elegidos para esta línea (uno de cada uno, tipo sí/no).</summary>
        public List<int> IdsIngredientesExtra { get; set; } = new();
    }

    public class SaleMaterialSelectionDto
    {
        public int IdMateriaPrimaBase { get; set; }
        public int IdMateriaPrimaSeleccionada { get; set; }
    }
}
