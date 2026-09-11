namespace SieteVidasAPI.DTOs
{
    /// <summary>Alta o edición de un ingrediente extra.</summary>
    public class ExtraIngredientDto
    {
        public string NombreIngredienteExtra { get; set; } = null!;
        public string? Descripcion { get; set; }
        public int Precio { get; set; }
        public int IdMateriaPrima { get; set; }
        public decimal CantidadRequerida { get; set; }
        public int IdUnidadMedida { get; set; }
    }

    /// <summary>Cambio de estado (activo/inactivo) de un ingrediente extra.</summary>
    public class ExtraIngredientStatusDto
    {
        public bool Activo { get; set; }
    }
}
