namespace SgalApp.Api.Services.Licensing;

/// <summary>
/// Estado de licencia en memoria (singleton), derivado del último token verificado. Es la fuente
/// de verdad en runtime para el acceso y los módulos habilitados. Aplica la gracia offline.
/// </summary>
public class LicenseState
{
    private readonly object _lock = new();
    private HashSet<string> _modulos = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _modulosCompletos = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _funcionalidades = new(StringComparer.OrdinalIgnoreCase);

    public bool HasToken { get; private set; }
    public string Status { get; private set; } = "unknown";
    public string Plan { get; private set; } = string.Empty;
    public DateTime? LicenseExpiresAt { get; private set; }
    public int GraceDays { get; private set; }
    public DateTime? LastSuccessfulCheckIn { get; private set; }

    public IReadOnlyCollection<string> Modulos
    {
        get { lock (_lock) { return _modulos.ToArray(); } }
    }

    public IReadOnlyCollection<string> ModulosCompletos
    {
        get { lock (_lock) { return _modulosCompletos.ToArray(); } }
    }

    public IReadOnlyCollection<string> Funcionalidades
    {
        get { lock (_lock) { return _funcionalidades.ToArray(); } }
    }

    public bool ModuloHabilitado(string codigo)
    {
        lock (_lock) { return _modulos.Contains(codigo); }
    }

    public void Actualizar(string status, DateTime? licenseExpiresAt, int graceDays, string plan,
        IEnumerable<string> modulos, IEnumerable<string> modulosCompletos,
        IEnumerable<string> funcionalidades, DateTime checkIn)
    {
        lock (_lock)
        {
            HasToken = true;
            Status = status;
            LicenseExpiresAt = licenseExpiresAt;
            GraceDays = graceDays;
            Plan = plan;
            LastSuccessfulCheckIn = checkIn;
            _modulos = new HashSet<string>(modulos, StringComparer.OrdinalIgnoreCase);
            _modulosCompletos = new HashSet<string>(modulosCompletos, StringComparer.OrdinalIgnoreCase);
            _funcionalidades = new HashSet<string>(funcionalidades, StringComparer.OrdinalIgnoreCase);
        }
    }

    /// <summary>
    /// La instalación puede operar si: hay un token, el estado es trial/active, la licencia no ha
    /// vencido, y el último check-in exitoso está dentro de la ventana de gracia (tolerancia offline).
    /// </summary>
    public bool AccesoPermitido
    {
        get
        {
            lock (_lock)
            {
                if (!HasToken) return false;
                if (Status is "suspended" or "expired") return false;
                var now = DateTime.UtcNow;
                if (LicenseExpiresAt.HasValue && now > LicenseExpiresAt.Value) return false;
                if (LastSuccessfulCheckIn.HasValue && now > LastSuccessfulCheckIn.Value.AddDays(GraceDays)) return false;
                return Status is "active" or "trial";
            }
        }
    }
}
