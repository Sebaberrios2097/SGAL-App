namespace SgalApp.Api.DTOs
{
    public class ProductDto
    {
        public int IdCategoriaProducto { get; set; }

        /// <summary>Código SKU opcional del producto. Puede quedar vacío.</summary>
        public string? CodigoProducto { get; set; }
        public string NombreProducto { get; set; } = null!;
        public string? DescripcionProducto { get; set; }
        public int Precio { get; set; }
        public int? Stock { get; set; }

        /// <summary>Umbral de bajo stock del producto (NULL = usar el default global).</summary>
        public int? StockMinimo { get; set; }
        public bool RequiereReceta { get; set; }
        public string? ImagenBase64 { get; set; }

        /// <summary>Si el producto admite ingredientes extra en la venta.</summary>
        public bool AceptaIngredientesExtra { get; set; }

        /// <summary>El producto es un pack de otro producto (no tiene stock propio).</summary>
        public bool EsPack { get; set; }

        /// <summary>Producto base del pack (requerido si EsPack).</summary>
        public int? IdProductoBase { get; set; }

        /// <summary>Unidades del base que representa una unidad del pack (requerido si EsPack).</summary>
        public int? CantidadPack { get; set; }
    }
}
