using PdfSharp.Fonts;

namespace SieteVidasAPI.Services;

public sealed class SystemPdfFontResolver : IFontResolver
{
    private const string Regular = "sietevidas-regular";
    private const string Bold = "sietevidas-bold";
    private const string Italic = "sietevidas-italic";
    private const string BoldItalic = "sietevidas-bold-italic";
    private readonly IReadOnlyDictionary<string, string> _fonts;

    public SystemPdfFontResolver()
    {
        _fonts = ResolveFontFiles();
    }

    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic)
    {
        var preferred = (bold, italic) switch
        {
            (true, true) => BoldItalic,
            (true, false) => Bold,
            (false, true) => Italic,
            _ => Regular
        };
        if (_fonts.ContainsKey(preferred)) return new FontResolverInfo(preferred);
        return new FontResolverInfo(Regular, bold, italic);
    }

    public byte[] GetFont(string faceName)
    {
        if (!_fonts.TryGetValue(faceName, out var path)) path = _fonts[Regular];
        return File.ReadAllBytes(path);
    }

    private static IReadOnlyDictionary<string, string> ResolveFontFiles()
    {
        var families = new[]
        {
            new[]
            {
                @"C:\Windows\Fonts\arial.ttf",
                @"C:\Windows\Fonts\arialbd.ttf",
                @"C:\Windows\Fonts\ariali.ttf",
                @"C:\Windows\Fonts\arialbi.ttf"
            },
            new[]
            {
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"
            },
            new[]
            {
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Italic.ttf",
                "/usr/share/fonts/truetype/liberation2/LiberationSans-BoldItalic.ttf"
            },
            new[]
            {
                "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
                "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"
            }
        };

        var family = families.FirstOrDefault(candidate => File.Exists(candidate[0]));
        if (family == null)
            throw new InvalidOperationException("No se encontró una fuente compatible para generar el PDF.");

        var names = new[] { Regular, Bold, Italic, BoldItalic };
        return names.Select((name, index) => new { name, path = family[index] })
            .Where(x => File.Exists(x.path))
            .ToDictionary(x => x.name, x => x.path);
    }
}
