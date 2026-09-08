namespace SieteVidasAPI.DTOs
{
    public class ProductDto
    {
        public int IdCategoriaProducto { get; set; }
        public string NombreProducto { get; set; } = null!;
        public string? DescripcionProducto { get; set; }
        public int Precio { get; set; }
        public int? Stock { get; set; }
        public bool RequiereReceta { get; set; }
        public string? ImagenBase64 { get; set; }
    }
}
