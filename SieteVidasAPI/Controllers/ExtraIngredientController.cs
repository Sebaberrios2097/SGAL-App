using Infraestructura.Context;
using Infraestructura.Entities.SieteVidas;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SieteVidasAPI.DTOs;
using SieteVidasAPI.Security;

namespace SieteVidasAPI.Controllers
{
    [ApiController]
    [Route("api/extra-ingredient")]
    public class ExtraIngredientController : ControllerBase
    {
        private readonly SieteVidasContext _context;

        public ExtraIngredientController(SieteVidasContext context)
        {
            _context = context;
        }

        [HttpGet]
        [Permission(Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetAll()
        {
            var items = await _context.InvIngredientesExtra
                .OrderBy(e => e.NombreIngredienteExtra)
                .Select(e => new
                {
                    e.IdIngredienteExtra,
                    e.NombreIngredienteExtra,
                    e.Descripcion,
                    e.Precio,
                    e.IdMateriaPrima,
                    NombreMateriaPrima = e.IdMateriaPrimaNavigation.NombreMaterial,
                    e.CantidadRequerida,
                    e.IdUnidadMedida,
                    AbreviacionUnidad = e.IdUnidadMedidaNavigation.Abreviacion,
                    e.Activo,
                    e.FechaCreacion,
                    e.FechaModificacion
                })
                .ToListAsync();
            return Ok(items);
        }

        /// <summary>
        /// Catálogo de ingredientes extra activos para el punto de venta. Accesible para
        /// quien opera ventas, sin exigir el permiso de gestión del mantenedor.
        /// </summary>
        [HttpGet("active")]
        [Permission(Permissions.SalesOperate + "|" + Permissions.SalesCreate + "|" + Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetActive()
        {
            var items = await _context.InvIngredientesExtra
                .Where(e => e.Activo)
                .OrderBy(e => e.NombreIngredienteExtra)
                .Select(e => new
                {
                    e.IdIngredienteExtra,
                    Nombre = e.NombreIngredienteExtra,
                    e.Precio
                })
                .ToListAsync();
            return Ok(items);
        }

        /// <summary>
        /// Materias primas y unidades para poblar el formulario del mantenedor, sin depender
        /// del permiso de catálogos de inventario.
        /// </summary>
        [HttpGet("options")]
        [Permission(Permissions.ExtraIngredientsView)]
        public async Task<IActionResult> GetOptions()
        {
            var materiasPrimas = await _context.InvMateriaPrima
                .OrderBy(m => m.NombreMaterial)
                .Select(m => new
                {
                    m.IdMateriaPrima,
                    m.NombreMaterial,
                    m.IdUnidadMedida,
                    TipoMagnitud = m.IdUnidadMedidaNavigation.TipoMagnitud,
                    AbreviacionUnidad = m.IdUnidadMedidaNavigation.Abreviacion
                })
                .ToListAsync();

            var unidades = await _context.InvUnidadesMedida
                .OrderBy(u => u.NombreUnidadMedida)
                .Select(u => new
                {
                    u.IdUnidadMedida,
                    u.NombreUnidadMedida,
                    u.Abreviacion,
                    u.TipoMagnitud
                })
                .ToListAsync();

            return Ok(new { MateriasPrimas = materiasPrimas, Unidades = unidades });
        }

        [HttpPost]
        [Permission(Permissions.ExtraIngredientsCreate)]
        public async Task<IActionResult> Create([FromBody] ExtraIngredientDto dto)
        {
            var validation = await ValidateAsync(dto);
            if (validation != null) return validation;

            var name = dto.NombreIngredienteExtra.Trim();
            if (await _context.InvIngredientesExtra.AnyAsync(e => e.NombreIngredienteExtra.ToLower() == name.ToLower()))
                return BadRequest(new { Mensaje = "Ya existe un ingrediente extra con ese nombre" });

            var entity = new InvIngredientesExtra
            {
                NombreIngredienteExtra = name,
                Descripcion = string.IsNullOrWhiteSpace(dto.Descripcion) ? null : dto.Descripcion.Trim(),
                Precio = dto.Precio,
                IdMateriaPrima = dto.IdMateriaPrima,
                CantidadRequerida = dto.CantidadRequerida,
                IdUnidadMedida = dto.IdUnidadMedida,
                Activo = true,
                FechaCreacion = DateTime.Now
            };

            _context.InvIngredientesExtra.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { entity.IdIngredienteExtra });
        }

        [HttpPut("{id:int}")]
        [Permission(Permissions.ExtraIngredientsEdit)]
        public async Task<IActionResult> Update(int id, [FromBody] ExtraIngredientDto dto)
        {
            var entity = await _context.InvIngredientesExtra.FindAsync(id);
            if (entity == null) return NotFound(new { Mensaje = "Ingrediente extra no encontrado" });

            var validation = await ValidateAsync(dto);
            if (validation != null) return validation;

            var name = dto.NombreIngredienteExtra.Trim();
            if (await _context.InvIngredientesExtra.AnyAsync(e => e.IdIngredienteExtra != id && e.NombreIngredienteExtra.ToLower() == name.ToLower()))
                return BadRequest(new { Mensaje = "Ya existe un ingrediente extra con ese nombre" });

            entity.NombreIngredienteExtra = name;
            entity.Descripcion = string.IsNullOrWhiteSpace(dto.Descripcion) ? null : dto.Descripcion.Trim();
            entity.Precio = dto.Precio;
            entity.IdMateriaPrima = dto.IdMateriaPrima;
            entity.CantidadRequerida = dto.CantidadRequerida;
            entity.IdUnidadMedida = dto.IdUnidadMedida;
            entity.FechaModificacion = DateTime.Now;

            await _context.SaveChangesAsync();
            return Ok(new { entity.IdIngredienteExtra });
        }

        [HttpPut("{id:int}/status")]
        [Permission(Permissions.ExtraIngredientsStatusEdit)]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] ExtraIngredientStatusDto dto)
        {
            var entity = await _context.InvIngredientesExtra.FindAsync(id);
            if (entity == null) return NotFound(new { Mensaje = "Ingrediente extra no encontrado" });

            entity.Activo = dto.Activo;
            entity.FechaModificacion = DateTime.Now;
            await _context.SaveChangesAsync();
            return Ok(new { entity.IdIngredienteExtra, entity.Activo });
        }

        /// <summary>
        /// Comprueba nombre, precio, cantidad y que la unidad elegida comparta magnitud
        /// con la unidad de inventario de la materia prima (para poder convertir el consumo).
        /// </summary>
        private async Task<IActionResult?> ValidateAsync(ExtraIngredientDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NombreIngredienteExtra))
                return BadRequest(new { Mensaje = "El nombre del ingrediente extra es obligatorio" });
            if (dto.NombreIngredienteExtra.Trim().Length > 50)
                return BadRequest(new { Mensaje = "El nombre no puede superar los 50 caracteres" });
            if (dto.Precio < 0)
                return BadRequest(new { Mensaje = "El precio no puede ser negativo" });
            if (dto.CantidadRequerida <= 0)
                return BadRequest(new { Mensaje = "La cantidad requerida debe ser mayor que cero" });

            var material = await _context.InvMateriaPrima
                .Include(m => m.IdUnidadMedidaNavigation)
                .FirstOrDefaultAsync(m => m.IdMateriaPrima == dto.IdMateriaPrima);
            if (material == null)
                return BadRequest(new { Mensaje = "La materia prima seleccionada no es válida" });

            var unit = await _context.InvUnidadesMedida.FindAsync(dto.IdUnidadMedida);
            if (unit == null)
                return BadRequest(new { Mensaje = "La unidad de medida seleccionada no es válida" });

            if (!string.Equals(unit.TipoMagnitud, material.IdUnidadMedidaNavigation.TipoMagnitud, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { Mensaje = $"La unidad debe ser de la misma magnitud que la materia prima ({material.IdUnidadMedidaNavigation.TipoMagnitud})." });

            return null;
        }
    }
}
