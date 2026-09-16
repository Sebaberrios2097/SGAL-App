using SgalApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Context;

public partial class SpSgalContext : DbContext
{
    public SpSgalContext(DbContextOptions<SpSgalContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

    private ISpSgalContextProcedures _procedures;

    public virtual ISpSgalContextProcedures Procedures
    {
        get
        {
            if (_procedures is null) _procedures = new SpSgalContextProcedures(this);
            return _procedures;
        }
        set
        {
            _procedures = value;
        }
    }

    public ISpSgalContextProcedures GetProcedures()
    {
        return Procedures;
    }
}