using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Entities;

[Table("SII_Caf_Folios")]
public partial class SiiCafFolios
{
    [Key]
    [Column("Id_Caf")]
    public int IdCaf { get; set; }

    [Column("Id_Tipo_DTE")]
    public int IdTipoDte { get; set; }

    [Column("Folio_Desde")]
    public int FolioDesde { get; set; }

    [Column("Folio_Hasta")]
    public int FolioHasta { get; set; }

    [Column("Ultimo_Folio_Utilizado")]
    public int UltimoFolioUtilizado { get; set; }

    [Column("Archivo_Xml_Caf")]
    public byte[] ArchivoXmlCaf { get; set; } = null!;

    /// <summary>True cuando el CAF fue generado por LibreDTE para desarrollo y no es válido ante el SII.</summary>
    [Column("Es_Prueba")]
    public bool EsPrueba { get; set; }

    [ForeignKey("IdTipoDte")]
    [InverseProperty("SiiCafFolios")]
    public virtual SiiTiposDte IdTipoDteNavigation { get; set; } = null!;
}
