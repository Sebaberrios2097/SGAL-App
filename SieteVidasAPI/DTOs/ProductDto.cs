namespace SieteVidasAPI.DTOs
{
    public class ProductDto
    {
        public int IdCategoriaProducto { get; set; }

        /// <summary>Código opcional del producto. Puede quedar vacío.</summary>
        public string? CodigoProducto { get; set; }
        public string NombreProducto { get; set; } = null!;
        public string? DescripcionProducto { get; set; }
        public int Precio { get; set; }
        public int? Stock { get; set; }
        public bool RequiereReceta { get; set; }
        public string? ImagenBase64 { get; set; }

        /// <summary>Si el producto admite ingredientes extra en la venta.</summary>
        public bool AceptaIngredientesExtra { get; set; }
    }
}
