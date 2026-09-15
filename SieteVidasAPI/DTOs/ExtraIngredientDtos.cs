namespace SieteVidasAPI.DTOs
{
    /// <summary>
    /// Configura una materia prima como ingrediente extra: recargo (precio), cantidad que
    /// consume por unidad del producto y unidad en que se expresa esa cantidad.
    /// </summary>
    public class ExtraIngredientDto
    {
        public int IdMateriaPrima { get; set; }
        public int Precio { get; set; }
        public decimal CantidadRequerida { get; set; }
        public int IdUnidadMedida { get; set; }
    }

    /// <summary>Activa o desactiva el uso de una materia prima como ingrediente extra.</summary>
    public class ExtraIngredientStatusDto
    {
        public bool Activo { get; set; }
    }
}
