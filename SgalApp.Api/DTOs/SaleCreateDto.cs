namespace SgalApp.Api.DTOs
{
    public class SaleCreateDto
    {
        public int? IdTurno { get; set; }
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();
        public List<SaleItemDto> Items { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al total (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }

        /// <summary>
        /// Si es true, la venta es un "consumo de empleado": se asocia a la bitácora del turno,
        /// queda por cobrar (sin métodos de pago) y aplica cortesía automática.
        /// </summary>
        public bool EsConsumoEmpleado { get; set; }
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

    /// <summary>Nuevo conjunto de líneas para un vale pendiente (edición en caja).</summary>
    public class SaleItemsUpdateDto
    {
        public List<SaleItemDto> Items { get; set; } = new();
    }

    /// <summary>Inicio de un cobro con tarjeta (Point) en caja: monto de tarjeta y descuento.</summary>
    public class CashPointStartDto
    {
        public int MontoTarjeta { get; set; }
        public decimal PorcentajeDescuento { get; set; }
    }

    /// <summary>Cobro en caja de un vale pendiente: descuento y métodos de pago.</summary>
    public class CashCollectDto
    {
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al cobro (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }
    }

    /// <summary>Marca (o desmarca) una venta de consumo como pagada por el empleado.</summary>
    public class ConsumptionPaidDto
    {
        public bool Pagado { get; set; }
    }

    /// <summary>Cambio de estado de la comanda (preparación) de una venta.</summary>
    public class ComandaEstadoDto
    {
        /// <summary>true marca la comanda como terminada; false la reabre.</summary>
        public bool Terminada { get; set; }
    }
}
