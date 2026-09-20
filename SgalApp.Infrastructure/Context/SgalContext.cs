using System;
using System.Collections.Generic;
using SgalApp.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace SgalApp.Infrastructure.Context;

public partial class SgalContext : DbContext
{
    public SgalContext(DbContextOptions<SgalContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AudAccesosUsuarios> AudAccesosUsuarios { get; set; }

    public virtual DbSet<EmpEmpleados> EmpEmpleados { get; set; }

    public virtual DbSet<EmpRolesUsuarios> EmpRolesUsuarios { get; set; }

    public virtual DbSet<EmpRolesXusuario> EmpRolesXusuario { get; set; }

    public virtual DbSet<EmpUsuarios> EmpUsuarios { get; set; }

    public virtual DbSet<SegModulo> SegModulos { get; set; }

    public virtual DbSet<SegPermiso> SegPermisos { get; set; }

    public virtual DbSet<SegPermisoRol> SegPermisosXRol { get; set; }

    public virtual DbSet<OrgConfiguracion> OrgConfiguracion { get; set; }

    public virtual DbSet<OrgModulo> OrgModulos { get; set; }

    public virtual DbSet<OrgLogo> OrgLogos { get; set; }

    public virtual DbSet<OrgLogoUbicacion> OrgLogosUbicaciones { get; set; }

    public virtual DbSet<OrgFondo> OrgFondos { get; set; }

    public virtual DbSet<SegModuloDependencia> SegModulosDependencias { get; set; }

    public virtual DbSet<InvCategoriaProductos> InvCategoriaProductos { get; set; }

    public virtual DbSet<InvConfiguracionCortesia> InvConfiguracionCortesia { get; set; }

    public virtual DbSet<InvCategoriasMateria> InvCategoriasMateria { get; set; }

    public virtual DbSet<InvDescuentosProductos> InvDescuentosProductos { get; set; }

    public virtual DbSet<InvEstadosOrdenCompra> InvEstadosOrdenCompra { get; set; }

    public virtual DbSet<InvMarcas> InvMarcas { get; set; }

    public virtual DbSet<InvMateriaPrima> InvMateriaPrima { get; set; }

    public virtual DbSet<InvMaterialesReceta> InvMaterialesReceta { get; set; }

    public virtual DbSet<InvOrdenCompra> InvOrdenCompra { get; set; }

    public virtual DbSet<InvOrdenDetalle> InvOrdenDetalle { get; set; }

    public virtual DbSet<InvFormatosCompra> InvFormatosCompra { get; set; }

    public virtual DbSet<InvProductos> InvProductos { get; set; }

    public virtual DbSet<InvProductosCortesia> InvProductosCortesia { get; set; }

    public virtual DbSet<InvPresentacionesMateriaPrima> InvPresentacionesMateriaPrima { get; set; }

    public virtual DbSet<InvProveedores> InvProveedores { get; set; }

    public virtual DbSet<InvRecetas> InvRecetas { get; set; }

    public virtual DbSet<InvUnidadesMedida> InvUnidadesMedida { get; set; }

    public virtual DbSet<SiiCafFolios> SiiCafFolios { get; set; }

    public virtual DbSet<SiiClientesEmpresa> SiiClientesEmpresa { get; set; }

    public virtual DbSet<SiiEstadosBoleta> SiiEstadosBoleta { get; set; }

    public virtual DbSet<SiiTiposDte> SiiTiposDte { get; set; }

    public virtual DbSet<TurBitacora> TurBitacora { get; set; }

    public virtual DbSet<TurDenominaciones> TurDenominaciones { get; set; }

    public virtual DbSet<TurEstadosTurnos> TurEstadosTurnos { get; set; }

    public virtual DbSet<TurExtracciones> TurExtracciones { get; set; }

    public virtual DbSet<TurProductosBitacora> TurProductosBitacora { get; set; }

    public virtual DbSet<TurProductosBitacoraMateriales> TurProductosBitacoraMateriales { get; set; }

    public virtual DbSet<TurTiposMovimientos> TurTiposMovimientos { get; set; }

    public virtual DbSet<TurTurno> TurTurno { get; set; }

    public virtual DbSet<TurTurnoDesglose> TurTurnoDesglose { get; set; }

    public virtual DbSet<TurTurnoDesgloseEfectivo> TurTurnoDesgloseEfectivo { get; set; }

    public virtual DbSet<VenDetalleVenta> VenDetalleVenta { get; set; }

    public virtual DbSet<VenDetalleVentaMateriales> VenDetalleVentaMateriales { get; set; }

    public virtual DbSet<VenEstadosVentas> VenEstadosVentas { get; set; }

    public virtual DbSet<VenMetodosPago> VenMetodosPago { get; set; }

    public virtual DbSet<VenMetodosPagoVenta> VenMetodosPagoVenta { get; set; }

    public virtual DbSet<VenOrdenesPoint> VenOrdenesPoint { get; set; }

    public virtual DbSet<VenVentas> VenVentas { get; set; }

    public virtual DbSet<VenDetalleVentaIngrediente> VenDetalleVentaIngrediente { get; set; }

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
            entity.Property(e => e.TipoDocumento).IsFixedLength().HasDefaultValue("RUN");

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

        modelBuilder.Entity<SegModulo>(entity =>
        {
            entity.HasIndex(x => x.Codigo).IsUnique();
        });

        modelBuilder.Entity<OrgConfiguracion>(entity =>
        {
            entity.Property(x => x.FechaActualizacion).HasDefaultValueSql("GETDATE()");
        });

        modelBuilder.Entity<OrgModulo>(entity =>
        {
            entity.HasKey(x => x.IdModulo);
            entity.Property(x => x.FechaActualizacion).HasDefaultValueSql("GETDATE()");
            entity.HasOne(x => x.Modulo)
                .WithOne(x => x.ConfiguracionOrganizacion)
                .HasForeignKey<OrgModulo>(x => x.IdModulo)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Org_Modulos_Seg_Modulos");
        });

        modelBuilder.Entity<OrgLogo>(entity =>
        {
            entity.Property(x => x.FechaCreacion).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.Property(x => x.FechaActualizacion).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        modelBuilder.Entity<OrgLogoUbicacion>(entity =>
        {
            entity.HasKey(x => x.CodigoUbicacion);
            entity.Property(x => x.FechaActualizacion).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(x => x.IdLogo);
            entity.HasOne(x => x.Logo).WithMany(x => x.Ubicaciones)
                .HasForeignKey(x => x.IdLogo)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Org_Logos_Ubicaciones_Org_Logos");
        });

        modelBuilder.Entity<OrgFondo>(entity =>
        {
            entity.HasKey(x => x.Zona);
            entity.Property(x => x.FechaActualizacion).HasDefaultValueSql("SYSUTCDATETIME()");
        });

        modelBuilder.Entity<SegModuloDependencia>(entity =>
        {
            entity.HasKey(x => new { x.IdModulo, x.IdModuloRequerido });
            entity.HasOne(x => x.Modulo).WithMany(x => x.Dependencias)
                .HasForeignKey(x => x.IdModulo).OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Seg_Modulos_Dependencias_Modulo");
            entity.HasOne(x => x.ModuloRequerido).WithMany(x => x.RequeridoPor)
                .HasForeignKey(x => x.IdModuloRequerido).OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Seg_Modulos_Dependencias_Requerido");
        });

        modelBuilder.Entity<SegPermiso>(entity =>
        {
            entity.HasIndex(x => x.Codigo).IsUnique();
            entity.HasOne(x => x.Modulo).WithMany(x => x.Permisos)
                .HasForeignKey(x => x.IdModulo).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SegPermisoRol>(entity =>
        {
            entity.HasKey(x => new { x.IdRolUsuario, x.IdPermiso });
            entity.HasOne(x => x.Rol).WithMany(x => x.SegPermisos)
                .HasForeignKey(x => x.IdRolUsuario).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Permiso).WithMany(x => x.Roles)
                .HasForeignKey(x => x.IdPermiso).OnDelete(DeleteBehavior.Cascade);
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

        modelBuilder.Entity<InvMateriaPrima>(entity =>
        {
            entity.HasOne(d => d.IdCategoriaMateriaNavigation).WithMany(p => p.InvMateriaPrima)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materia_Prima_Inv_Categorias_Materia");

            entity.HasOne(d => d.IdMarcaNavigation).WithMany(p => p.InvMateriaPrima)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materia_Prima_Inv_Marcas");

            entity.HasOne(d => d.IdUnidadMedidaNavigation).WithMany(p => p.InvMateriaPrima)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materia_Prima_Inv_Unidades_Medida");

            entity.HasOne(d => d.IdUnidadIngredienteExtraNavigation).WithMany(p => p.InvMateriaPrimaComoUnidadExtra)
                .HasForeignKey(d => d.IdUnidadIngredienteExtra)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Inv_Materia_Prima_Unidad_Ingrediente_Extra");
        });

        modelBuilder.Entity<InvMaterialesReceta>(entity =>
        {
            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.InvMaterialesReceta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materiales_Receta_Inv_Materia_Prima");

            entity.HasOne(d => d.IdMateriaPrimaReemplazadaNavigation).WithMany(p => p.InvMaterialesRecetaComoMateriaBase)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Inv_Materiales_Receta_Materia_Reemplazada");

            entity.HasOne(d => d.IdRecetaNavigation).WithMany(p => p.InvMaterialesReceta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materiales_Receta_Inv_Recetas");

            entity.HasOne(d => d.IdUnidadMedidaNavigation).WithMany(p => p.InvMaterialesReceta)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Materiales_Receta_Inv_Unidades_Medida");
        });

        modelBuilder.Entity<VenDetalleVentaIngrediente>(entity =>
        {
            entity.HasOne(d => d.IdDetalleVentaNavigation).WithMany(p => p.VenDetalleVentaIngrediente)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Ven_Detalle_Venta_Ingredientes_Ven_Detalle_Venta");

            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.VenDetalleVentaIngrediente)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Detalle_Venta_Ingredientes_Inv_Materia_Prima");
        });

        modelBuilder.Entity<InvPresentacionesMateriaPrima>(entity =>
        {
            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.InvPresentacionesMateriaPrima)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Inv_Presentaciones_Materia_Prima_Inv_Materia_Prima");

            entity.HasOne(d => d.IdUnidadMedidaNavigation).WithMany(p => p.InvPresentacionesMateriaPrima)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Presentaciones_Materia_Prima_Inv_Unidades_Medida");
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

            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvOrdenDetalle)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Inv_Orden_Detalle_Inv_Productos");

            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.InvOrdenDetalle)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Inv_Orden_Detalle_Inv_Materia_Prima");

            entity.HasOne(d => d.IdFormatoCompraNavigation).WithMany(p => p.InvOrdenDetalle)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Inv_Orden_Detalle_Inv_Formatos_Compra");

            entity.ToTable(t => t.HasCheckConstraint(
                "CK_Inv_Orden_Detalle_Tipo_Item",
                "([Id_Producto] IS NOT NULL AND [Id_Materia_Prima] IS NULL) OR ([Id_Producto] IS NULL AND [Id_Materia_Prima] IS NOT NULL)"));
        });

        modelBuilder.Entity<InvFormatosCompra>(entity =>
        {
            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvFormatosCompra)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Inv_Formatos_Compra_Producto");

            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.InvFormatosCompra)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Inv_Formatos_Compra_Materia");
        });

        modelBuilder.Entity<InvProductos>(entity =>
        {
            entity.HasOne(d => d.IdCategoriaProductoNavigation).WithMany(p => p.InvProductos)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Productos_Inv_Categoria_Productos");
        });

        modelBuilder.Entity<InvProductosCortesia>(entity =>
        {
            entity.ToTable("Inv_Productos_Cortesia", tb => tb.HasComment("Tabla que guarda todos los productos de cortesía para los empleados. Ejemplo 1 americano y un espresso por día gratis."));

            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvProductosCortesia)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Productos_Cortesia_Inv_Productos");
        });

        modelBuilder.Entity<InvRecetas>(entity =>
        {
            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.InvRecetas)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Inv_Recetas_Inv_Productos");
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

        modelBuilder.Entity<TurBitacora>(entity =>
        {
            entity.HasOne(d => d.IdTurnoNavigation).WithMany(p => p.TurBitacora)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Bitacora_Tur_Turno");
        });

        modelBuilder.Entity<TurDenominaciones>(entity =>
        {
            entity.ToTable("Tur_Denominaciones", tb => tb.HasComment("Almacena denominaciones de dinero (ej. billete de 1000 pesos, moneda de 10 pesos, moneda de 500 pesos, etc.)"));
        });

        modelBuilder.Entity<TurExtracciones>(entity =>
        {
            entity.HasOne(d => d.IdBitacoraNavigation).WithMany(p => p.TurExtracciones)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Extracciones_Tur_Bitacora");

            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.TurExtracciones)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Extracciones_Inv_Materia_Prima");
        });

        modelBuilder.Entity<TurProductosBitacora>(entity =>
        {
            entity.ToTable("Tur_Productos_Bitacora", tb => tb.HasComment("Tabla que guarda los productos consumidos por el empleado."));

            entity.HasOne(d => d.IdBitacoraNavigation).WithMany(p => p.TurProductosBitacora)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Productos_Bitacora_Tur_Bitacora");

            entity.HasOne(d => d.IdProductoNavigation).WithMany(p => p.TurProductosBitacora)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Productos_Bitacora_Inv_Productos");
        });

        modelBuilder.Entity<TurProductosBitacoraMateriales>(entity =>
        {
            entity.HasOne(d => d.IdProductosBitacoraNavigation)
                .WithMany(p => p.TurProductosBitacoraMateriales)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Productos_Bitacora_Materiales_Tur_Productos_Bitacora");

            entity.HasOne(d => d.IdMateriaPrimaNavigation)
                .WithMany(p => p.TurProductosBitacoraMateriales)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tur_Productos_Bitacora_Materiales_Inv_Materia_Prima");
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

        modelBuilder.Entity<VenDetalleVentaMateriales>(entity =>
        {
            entity.HasOne(d => d.IdDetalleVentaNavigation).WithMany(p => p.VenDetalleVentaMateriales)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_Ven_Detalle_Venta_Materiales_Ven_Detalle_Venta");

            entity.HasOne(d => d.IdMateriaPrimaNavigation).WithMany(p => p.VenDetalleVentaMateriales)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Ven_Detalle_Venta_Materiales_Inv_Materia_Prima");
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

        modelBuilder.Entity<VenOrdenesPoint>(entity =>
        {
            entity.HasOne(d => d.IdVentaNavigation).WithMany(p => p.VenOrdenesPoint).HasConstraintName("FK_Ven_Ordenes_Point_Ven_Ventas");
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
                .HasForeignKey(d => d.IdTurno)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Ven_Ventas_Tur_Turno");

            entity.HasOne(d => d.IdUsuarioNavigation).WithMany(p => p.VenVentas)
                .HasForeignKey(d => d.IdUsuario)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Ven_Ventas_Emp_Usuarios");

            entity.HasOne(d => d.IdBitacoraNavigation).WithMany(p => p.VenVentas)
                .HasForeignKey(d => d.IdBitacora)
                .OnDelete(DeleteBehavior.NoAction)
                .HasConstraintName("FK_Ven_Ventas_Tur_Bitacora");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
