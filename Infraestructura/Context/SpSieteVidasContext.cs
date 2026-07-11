using Infraestructura.Data;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Context;

public partial class SpSieteVidasContext : DbContext
{
    public SpSieteVidasContext(DbContextOptions<SpSieteVidasContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

    private ISpSieteVidasContextProcedures _procedures;

    public virtual ISpSieteVidasContextProcedures Procedures
    {
        get
        {
            if (_procedures is null) _procedures = new SpSieteVidasContextProcedures(this);
            return _procedures;
        }
        set
        {
            _procedures = value;
        }
    }

    public ISpSieteVidasContextProcedures GetProcedures()
    {
        return Procedures;
    }
}