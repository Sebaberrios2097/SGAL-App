using System;
using System.Collections.Generic;
using Infraestructura.Entities.SieteVidas;
using Microsoft.EntityFrameworkCore;

namespace Infraestructura.Context;

public partial class SieteVidasContext : DbContext
{
    public SieteVidasContext(DbContextOptions<SieteVidasContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AudAccesosUsuarios> AudAccesosUsuarios { get; set; }

    public virtual DbSet<EmpEmpleados> EmpEmpleados { get; set; }

    public virtual DbSet<EmpRolesUsuarios> EmpRolesUsuarios { get; set; }

    public virtual DbSet<EmpRolesXusuario> EmpRolesXusuario { get; set; }

    public virtual DbSet<EmpUsuarios> EmpUsuarios { get; set; }

    public virtual DbSet<InvCategoriaProductos> InvCategoriaProductos { get; set; }

    public virtual DbSet<InvDescuentosProductos> InvDescuentosProductos { get; set; }

    public virtual DbSet<InvEstadosOrdenCompra> InvEstadosOrdenCompra { get; set; }

    public virtual DbSet<InvOrdenCompra> InvOrdenCompra { get; set; }

    public virtual DbSet<InvOrdenDetalle> InvOrdenDetalle { get; set; }

    public virtual DbSet<InvProductos> InvProductos { get; set; }

    public virtual DbSet<InvProductosProveedores> InvProductosProveedores { get; set; }

    public virtual DbSet<InvProveedores> InvProveedores { get; set; }

    public virtual DbSet<SiiCafFolios> SiiCafFolios { get; set; }

    public virtual DbSet<SiiClientesEmpresa> SiiClientesEmpresa { get; set; }

    public virtual DbSet<SiiEstadosBoleta> SiiEstadosBoleta { get; set; }

    public virtual DbSet<SiiTiposDte> SiiTiposDte { get; set; }

    public virtual DbSet<TurDenominaciones> TurDenominaciones { get; set; }

    public virtual DbSet<TurEstadosTurnos> TurEstadosTurnos { get; set; }

    public virtual DbSet<TurTiposMovimientos> TurTiposMovimientos { get; set; }

    public virtual DbSet<TurTurno> TurTurno { get; set; }

    public virtual DbSet<TurTurnoDesglose> TurTurnoDesglose { get; set; }

    public virtual DbSet<TurTurnoDesgloseEfectivo> TurTurnoDesgloseEfectivo { get; set; }

    public virtual DbSet<VenDetalleVenta> VenDetalleVenta { get; set; }

    public virtual DbSet<VenEstadosVentas> VenEstadosVentas { get; set; }

    public virtual DbSet<VenMetodosPago> VenMetodosPago { get; set; }

    public virtual DbSet<VenMetodosPagoVenta> VenMetodosPagoVenta { get; set; }

    public virtual DbSet<VenVentas> VenVentas { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AudAccesosUsuarios>(entity =>
        {
            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.AudAccesosUsuarios)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Aud_Accesos_Usuarios_Emp_Usuarios");
        });

        modelBuilder.Entity<EmpEmpleados>(entity =>
        {
            entity.Property(e => e.Activo).HasComment("Solo puede haber un rut activo a la vez. Si se desactiva y se necesita volver a registrar al mismo empleado, se debe crear un nuevo registro.");
            entity.Property(e => e.Dv).IsFixedLength();

            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.EmpEmpleados).HasConstraintName("FK_Emp_Empleados_Emp_Usuarios");
        });

        modelBuilder.Entity<EmpRolesXusuario>(entity =>
        {
            entity.Property(e => e.Activo).HasComment("Al igual que el empleado, si un usuario se desactiva y necesita volver a crear se debe crear un registro nuevo.");

            entity.HasOne(d => d.IdRolUsuarioNavigation).WithMany(p => p.EmpRolesXusuario)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Emp_RolesXUsuario_Emp_Roles_Usuarios");

            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.EmpRolesXusuario)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Emp_RolesXUsuario_Emp_Usuarios");
        });

        modelBuilder.Entity<EmpUsuarios>(entity =>
        {
            entity.Property(e => e.Pass).IsFixedLength();
        });

        modelBuilder.Entity<InvCategoriaProductos>(entity =>
        {
            entity.Property(e => e.RequiereReceta).HasComment("Indica si los productos que pertenezcan a la categoría tendrán receta para elaborar el producto. Si tienen, el producto no tendrá stock directo.");
        });

        modelBuilder.Entity<InvDescuentosProductos>(entity =>
        {
            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvDescuentosProductos)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Descuentos_Productos_Inv_Productos");
        });

        modelBuilder.Entity<InvOrdenCompra>(entity =>
        {
            entity.HasOne(d => d.IdEstadoOrdenCompraNavigation).WithMany(p => p.InvOrdenCompra)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Orden_Compra_Inv_Estados_Orden_Compra");

            entity.HasOne(d => d.IdProveedorNavigation).WithMany(p => p.InvOrdenCompra)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Orden_Compra_Inv_Proveedores");

            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.InvOrdenCompra)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Orden_Compra_Emp_Usuarios");
        });

        modelBuilder.Entity<InvOrdenDetalle>(entity =>
        {
            entity.HasOne(d => d.IdOrdenCompraNavigation).WithMany(p => p.InvOrdenDetalle)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Orden_Detalle_Inv_Orden_Compra");

            entity.HasOne(d => d.IdProveedorNavigation).WithMany(p => p.InvOrdenDetalle)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Orden_Detalle_Inv_Proveedores");
        });

        modelBuilder.Entity<InvProductos>(entity =>
        {
            entity.HasOne(d => d.IdCategoriaProductoNavigation).WithMany(p => p.InvProductos)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Productos_Inv_Categoria_Productos");
        });

        modelBuilder.Entity<InvProductosProveedores>(entity =>
        {
            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvProductosProveedores)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Productos_Proveedores_Inv_Productos");

            entity.HasOne(d => d.IdProveedorNavigation).WithMany(p => p.InvProductosProveedores)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Productos_Proveedores_Inv_Proveedores");
        });

        modelBuilder.Entity<SiiCafFolios>(entity =>
        {
            entity.HasOne(d => d.IdTipoDteNavigation).WithMany(p => p.SiiCafFolios)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SII_Caf_Folios_SII_Tipos_DTE");
        });

        modelBuilder.Entity<SiiClientesEmpresa>(entity =>
        {
            entity.Property(e => e.DireccionLegal).HasComment("Dirección comercial");
            entity.Property(e => e.Giro).HasComment("Actividad económica obligatoria para el DTE");
            entity.Property(e => e.RazonSocial).HasComment("Nombre legal de la empresa");
            entity.Property(e => e.RutEmpresa).HasComment("Rut con guion y dígito verificador");
        });

        modelBuilder.Entity<SiiTiposDte>(entity =>
        {
            entity.Property(e => e.IdTipoDte)
                .ValueGeneratedNever()
                .HasComment("Código oficial del SII.");
        });

        modelBuilder.Entity<TurDenominaciones>(entity =>
        {
            entity.ToTable("Tur_Denominaciones", tb => tb.HasComment("Almacena denominaciones de dinero (ej. billete de 1000 pesos, moneda de 10 pesos, moneda de 500 pesos, etc.)"));
        });

        modelBuilder.Entity<TurTurno>(entity =>
        {
            entity.Property(e => e.DiferenciaTotal).HasComment("Indica la cuadratura general del turno incluyendo todos los métodos de pago: si es negativo faltó dinero, si es positivo sobró. \r\nTodos los detalles se encontrarán en la tabla Tur_Turno_Desglose.");

            entity.HasOne(d => d.IdEstadoTurnoNavigation).WithMany(p => p.TurTurno)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Tur_Estados_Turnos");

            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.TurTurno)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Emp_Usuarios");
        });

        modelBuilder.Entity<TurTurnoDesglose>(entity =>
        {
            entity.ToTable("Tur_Turno_Desglose", tb => tb.HasComment("Tabla que guarda el desglose por método de pago al final del turno.\r\nSi es efectivo, se debe calcula el monto total que haya en la tabla Tur_Turno_Desglose_Efectivo."));

            entity.HasOne(d => d.IdMetodoPagoNavigation).WithMany(p => p.TurTurnoDesglose)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Desglose_Ven_Metodos_Pago");

            entity.HasOne(d => d.IdTurnoNavigation).WithMany(p => p.TurTurnoDesglose)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Desglose_Tur_Turno");
        });

        modelBuilder.Entity<TurTurnoDesgloseEfectivo>(entity =>
        {
            entity.ToTable("Tur_Turno_Desglose_Efectivo", tb => tb.HasComment("Tabla que guarda el desglose de efectivo tanto al inicio como al fin del turno. Permite saber con cuánto dinero de cada denominación se inició el turno y con cuánto se terminó."));

            entity.HasOne(d => d.IdDenominacionNavigation).WithMany(p => p.TurTurnoDesgloseEfectivo)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Desglose_Efectivo_Tur_Denominaciones");

            entity.HasOne(d => d.IdTipoMovimientoNavigation).WithMany(p => p.TurTurnoDesgloseEfectivo)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Desglose_Efectivo_Tur_Tipos_Movimientos");

            entity.HasOne(d => d.IdTurnoNavigation).WithMany(p => p.TurTurnoDesgloseEfectivo)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Turno_Desglose_Efectivo_Tur_Turno");
        });

        modelBuilder.Entity<VenDetalleVenta>(entity =>
        {
            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.VenDetalleVenta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Detalle_Venta_Inv_Productos");

            entity.HasOne(d => d.IdVentaNavigation).WithMany(p => p.VenDetalleVenta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Detalle_Venta_Ven_Ventas");
        });

        modelBuilder.Entity<VenMetodosPagoVenta>(entity =>
        {
            entity.ToTable("Ven_Metodos_Pago_Venta", tb => tb.HasComment("Se pueden registrar más de un método de pago para una venta en particular. La suma de todos los métodos de pago especificados para la venta deben ser igual al Monto_Total de dicha venta."));

            entity.HasOne(d => d.IdMetodoPagoNavigation).WithMany(p => p.VenMetodosPagoVenta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Metodos_Pago_Venta_Ven_Metodos_Pago");

            entity.HasOne(d => d.IdVentaNavigation).WithMany(p => p.VenMetodosPagoVenta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Metodos_Pago_Venta_Ven_Ventas");
        });

        modelBuilder.Entity<VenVentas>(entity =>
        {
            entity.HasOne(d => d.IdClienteEmpresaNavigation).WithMany(p => p.VenVentas).HasConstraintName("FK_Ven_Ventas_SII_Clientes_Empresa");

            entity.HasOne(d => d.IdEstadoBoletaNavigation).WithMany(p => p.VenVentas).HasConstraintName("FK_Ven_Ventas_SII_Estados_Boleta");

            entity.HasOne(d => d.IdEstadoVentaNavigation).WithMany(p => p.VenVentas)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Ventas_Ven_Estados_Ventas");

            entity.HasOne(d => d.IdTipoDteNavigation).WithMany(p => p.VenVentas).HasConstraintName("FK_Ven_Ventas_SII_Tipos_DTE");

            entity.HasOne(d => d.IdTurnoNavigation).WithMany(p => p.VenVentas)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Ventas_Tur_Turno");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
