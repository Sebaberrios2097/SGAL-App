namespace SgalApp.Api.DTOs
{
    public class NamedCatalogDto
    {
        public string Nombre { get; set; } = string.Empty;
    }

    public class MeasurementUnitDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string Abreviacion { get; set; } = string.Empty;
        public string TipoMagnitud { get; set; } = string.Empty;
        public decimal FactorConversionBase { get; set; }
        public bool EsUnidadBase { get; set; }
    }

    public class CourtesyProductDto
    {
        public int IdProducto { get; set; }
        public int CantidadDiaria { get; set; }
    }

    public class CourtesyPolicyDto
    {
        public int LimiteDiarioGlobal { get; set; }
    }

    public class RawMaterialDto
    {
        public int IdMarca { get; set; }
        public int IdCategoriaMateria { get; set; }
        public int IdUnidadMedida { get; set; }
        public string NombreMaterial { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public decimal Cantidad { get; set; }
        public string? ImagenBase64 { get; set; }

        /// <summary>Marca esta materia prima como el café cuya cantidad en recetas se toma de
        /// la última calibración (extracción) del turno. Solo una puede estar marcada.</summary>
        public bool EsCafeCalibrable { get; set; }

        /// <summary>Marca la materia prima como no controlada en inventario (p. ej. el agua):
        /// no exige existencia y las recetas que la usen no descuentan stock.</summary>
        public bool NoDescuentaInventario { get; set; }

        /// <summary>Recargo base (cargo adicional) al usarse como opción de un ingrediente. 0 = sin cargo.</summary>
        public int RecargoBase { get; set; }

        /// <summary>Si el recargo base puede ajustarse por receta (true) o queda fijo (false).</summary>
        public bool RecargoModificable { get; set; }
    }

    public class RecipeUpdateDto
    {
        public List<RecipeMaterialDto> Materiales { get; set; } = new();
    }

    public class RecipeMaterialDto
    {
        public int IdMateriaPrima { get; set; }
        public int IdUnidadMedida { get; set; }
        public decimal CantidadRequerida { get; set; }
        public int? IdMateriaPrimaReemplazada { get; set; }
        public int Recargo { get; set; }
        public bool UsaMismaMedidaQuePrincipal { get; set; }
    }

    public class RawMaterialPresentationDto
    {
        public int IdMateriaPrima { get; set; }
        public int IdUnidadMedida { get; set; }
        public string NombrePresentacion { get; set; } = string.Empty;
        public decimal CantidadContenido { get; set; }
        public bool Activo { get; set; } = true;
    }

    public class RawMaterialStockEntryDto
    {
        public int CantidadPresentaciones { get; set; }
    }

    public class LogbookProductCreateDto
    {
        public int IdUsuario { get; set; }
        public int IdTurno { get; set; }
        public int IdProducto { get; set; }
        public int Cantidad { get; set; }
        public bool SolicitarComoCortesia { get; set; }
        public string? Observacion { get; set; }
    }

    public class LogbookProductVoidDto
    {
        public int IdUsuario { get; set; }
    }
}
