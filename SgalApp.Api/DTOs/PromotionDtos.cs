namespace SgalApp.Api.DTOs
{
    /// <summary>Alta/edición de una promoción con toda su configuración de grupos.</summary>
    public sealed class PromotionUpsertDto
    {
        public string Nombre { get; set; } = string.Empty;
        public int Precio { get; set; }
        public string? Descripcion { get; set; }
        public DateTime? FechaInicio { get; set; }
        public DateTime? FechaFin { get; set; }
        public bool Activo { get; set; } = true;
        public List<PromotionGroupDto> Grupos { get; set; } = new();
    }

    public sealed class PromotionGroupDto
    {
        public bool EsBase { get; set; }
        public string Nombre { get; set; } = string.Empty;
        /// <summary>Opciones a elegir en un grupo excluyente (ignorado en el grupo base).</summary>
        public int CantidadElegir { get; set; } = 1;
        public int Orden { get; set; }
        public List<PromotionGroupProductDto> Productos { get; set; } = new();
    }

    public sealed class PromotionGroupProductDto
    {
        public int IdProducto { get; set; }
        public int Cantidad { get; set; } = 1;
    }

    public sealed class PromotionStatusDto
    {
        public bool Activo { get; set; }
    }
}
