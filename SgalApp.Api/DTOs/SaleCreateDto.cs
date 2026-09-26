namespace SgalApp.Api.DTOs
{
    public class SaleCreateDto
    {
        public int? IdTurno { get; set; }
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();
        public List<SaleItemDto> Items { get; set; } = new();

        /// <summary>Promociones agregadas a la venta (además de los productos sueltos).</summary>
        public List<SalePromoInstanceDto> Promociones { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al total (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }

        /// <summary>
        /// Si es true, la venta es un "consumo de empleado": se asocia a la bitácora del turno,
        /// queda por cobrar (sin métodos de pago) y aplica cortesía automática.
        /// </summary>
        public bool EsConsumoEmpleado { get; set; }
        public string TipoDocumento { get; set; } = "boleta";
        public FacturaReceptorDto? ReceptorFactura { get; set; }
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
        /// <summary>Envases vacíos entregados por el cliente para esta línea.</summary>
        public int EnvasesRecibidos { get; set; }
        public List<SaleMaterialSelectionDto> SeleccionesMateriales { get; set; } = new();

        /// <summary>Ingredientes extra elegidos para esta línea (uno de cada uno, tipo sí/no).</summary>
        public List<int> IdsIngredientesExtra { get; set; } = new();
    }

    public class SaleMaterialSelectionDto
    {
        public int IdMateriaPrimaBase { get; set; }
        public int IdMateriaPrimaSeleccionada { get; set; }
    }

    /// <summary>Instancia de una promoción en la venta: la promo y las opciones elegidas.</summary>
    public class SalePromoInstanceDto
    {
        public int IdPromocion { get; set; }

        /// <summary>Cuántas veces se lleva esta promoción (por defecto 1).</summary>
        public int Cantidad { get; set; } = 1;

        /// <summary>Selecciones de los grupos excluyentes (idGrupo + idProducto por cada elección).</summary>
        public List<SalePromoSelectionDto> Selecciones { get; set; } = new();
    }

    public class SalePromoSelectionDto
    {
        public int IdGrupo { get; set; }
        public int IdProducto { get; set; }
        public int Cantidad { get; set; } = 1;
    }

    /// <summary>Promoción ya persistida, reconstruida para edición y presentación.</summary>
    public sealed class SaleAppliedPromotionDto
    {
        public int IdVentaPromocion { get; set; }
        public int IdPromocion { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int Cantidad { get; set; }
        public int Precio { get; set; }
        public int MontoIndividual { get; set; }
        public int Descuento { get; set; }
        public List<SalePromoSelectionDto> Selecciones { get; set; } = new();
        public List<SaleAppliedPromotionProductDto> Productos { get; set; } = new();
    }

    public sealed class SaleAppliedPromotionProductDto
    {
        public int IdProducto { get; set; }
        public string NombreProducto { get; set; } = string.Empty;
        public int Cantidad { get; set; }
        public int PrecioUnitario { get; set; }
        public int Subtotal { get; set; }
    }

    /// <summary>Nuevo conjunto de líneas para un vale pendiente (edición en caja).</summary>
    public class SaleItemsUpdateDto
    {
        public List<SaleItemDto> Items { get; set; } = new();

        /// <summary>Promociones a conservar/aplicar en el vale editado.</summary>
        public List<SalePromoInstanceDto> Promociones { get; set; } = new();
    }

    /// <summary>Inicio de un cobro con tarjeta (Point) en caja: monto de tarjeta y descuento.</summary>
    public class CashPointStartDto
    {
        public int MontoTarjeta { get; set; }
        public decimal PorcentajeDescuento { get; set; }
        public string TipoDocumento { get; set; } = "boleta";
        public FacturaReceptorDto? ReceptorFactura { get; set; }
    }

    /// <summary>Cobro en caja de un vale pendiente: descuento y métodos de pago.</summary>
    public class CashCollectDto
    {
        public List<SalePaymentMethodDto> MetodosPago { get; set; } = new();

        /// <summary>Porcentaje de descuento aplicado al cobro (0 = sin descuento).</summary>
        public decimal PorcentajeDescuento { get; set; }
        public string TipoDocumento { get; set; } = "boleta";
        public FacturaReceptorDto? ReceptorFactura { get; set; }
    }

    public sealed class CashSaleVoidDto
    {
        [System.ComponentModel.DataAnnotations.StringLength(300)]
        public string? Motivo { get; set; }
    }

    public sealed class FacturaReceptorDto
    {
        public int? IdClienteEmpresa { get; set; }
        public string Rut { get; set; } = string.Empty;
        public string RazonSocial { get; set; } = string.Empty;
        public string Giro { get; set; } = string.Empty;
        public string Direccion { get; set; } = string.Empty;
        public string Comuna { get; set; } = string.Empty;
        public string Ciudad { get; set; } = string.Empty;
        public string? Correo { get; set; }
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
