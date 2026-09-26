/* Productos retornables, recargos y vales de devolución trazables. */
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.Org_Configuracion', 'Retornables_Precio_General') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Retornables_Precio_General int NOT NULL
        CONSTRAINT DF_Org_Retornables_Precio DEFAULT (0) WITH VALUES;
IF COL_LENGTH('dbo.Org_Configuracion', 'Retornables_Medio_Pago') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Retornables_Medio_Pago varchar(12) NOT NULL
        CONSTRAINT DF_Org_Retornables_Medio DEFAULT ('EFECTIVO') WITH VALUES;
IF COL_LENGTH('dbo.Org_Configuracion', 'Retornables_Vigencia_Dias') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Retornables_Vigencia_Dias int NULL;

IF OBJECT_ID('dbo.Ven_Productos_Retornables', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ven_Productos_Retornables
    (
        Id_Producto int NOT NULL CONSTRAINT PK_Ven_Productos_Retornables PRIMARY KEY,
        Precio_Envase int NULL,
        Medio_Pago varchar(12) NULL,
        Activo bit NOT NULL CONSTRAINT DF_Ven_Retornables_Activo DEFAULT (1),
        Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Ven_Retornables_Fecha DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Ven_Retornables_Producto FOREIGN KEY (Id_Producto) REFERENCES dbo.Inv_Productos(Id_Producto),
        CONSTRAINT CK_Ven_Retornables_Precio CHECK (Precio_Envase IS NULL OR Precio_Envase >= 0),
        CONSTRAINT CK_Ven_Retornables_Medio CHECK (Medio_Pago IS NULL OR Medio_Pago IN ('EFECTIVO','TODOS'))
    );
END;

IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Envases_Recibidos') IS NULL
    ALTER TABLE dbo.Ven_Detalle_Venta ADD Envases_Recibidos int NOT NULL
        CONSTRAINT DF_Ven_Detalle_Envases_Recibidos DEFAULT (0) WITH VALUES;
IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Precio_Envase') IS NULL
    ALTER TABLE dbo.Ven_Detalle_Venta ADD Precio_Envase int NOT NULL
        CONSTRAINT DF_Ven_Detalle_Precio_Envase DEFAULT (0) WITH VALUES;
IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Recargo_Envases') IS NULL
    ALTER TABLE dbo.Ven_Detalle_Venta ADD Recargo_Envases int NOT NULL
        CONSTRAINT DF_Ven_Detalle_Recargo_Envases DEFAULT (0) WITH VALUES;

IF OBJECT_ID('dbo.Ven_Vales_Envases', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ven_Vales_Envases
    (
        Id_Vale_Envase int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Vales_Envases PRIMARY KEY,
        Codigo varchar(40) NOT NULL CONSTRAINT UQ_Ven_Vales_Envases_Codigo UNIQUE,
        Id_Venta int NOT NULL,
        Id_Vale_Origen int NULL,
        Id_Vale_Padre int NULL,
        Fecha_Emision datetime NOT NULL,
        Fecha_Vencimiento datetime NULL,
        Fecha_Canje datetime NULL,
        Id_Turno_Canje int NULL,
        Id_Usuario_Canje int NULL,
        Monto_Original int NOT NULL,
        Monto_Canjeado int NOT NULL CONSTRAINT DF_Ven_Vales_Monto_Canjeado DEFAULT (0),
        Estado varchar(12) NOT NULL CONSTRAINT DF_Ven_Vales_Estado DEFAULT ('VIGENTE'),
        CONSTRAINT FK_Ven_Vales_Venta FOREIGN KEY (Id_Venta) REFERENCES dbo.Ven_Ventas(Id_Venta),
        CONSTRAINT FK_Ven_Vales_Origen FOREIGN KEY (Id_Vale_Origen) REFERENCES dbo.Ven_Vales_Envases(Id_Vale_Envase),
        CONSTRAINT FK_Ven_Vales_Padre FOREIGN KEY (Id_Vale_Padre) REFERENCES dbo.Ven_Vales_Envases(Id_Vale_Envase),
        CONSTRAINT FK_Ven_Vales_Turno FOREIGN KEY (Id_Turno_Canje) REFERENCES dbo.Tur_Turno(Id_Turno),
        CONSTRAINT FK_Ven_Vales_Usuario FOREIGN KEY (Id_Usuario_Canje) REFERENCES dbo.Emp_Usuarios(Id_Usuario),
        CONSTRAINT CK_Ven_Vales_Estado CHECK (Estado IN ('VIGENTE','CANJEADO','VENCIDO','ANULADO'))
    );
END;

IF OBJECT_ID('dbo.Ven_Vales_Envases_Detalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ven_Vales_Envases_Detalle
    (
        Id_Vale_Envase_Detalle int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Vales_Envases_Detalle PRIMARY KEY,
        Id_Vale_Envase int NOT NULL,
        Id_Producto int NOT NULL,
        Cantidad int NOT NULL,
        Precio_Unitario int NOT NULL,
        CONSTRAINT FK_Ven_Vales_Detalle_Vale FOREIGN KEY (Id_Vale_Envase) REFERENCES dbo.Ven_Vales_Envases(Id_Vale_Envase),
        CONSTRAINT FK_Ven_Vales_Detalle_Producto FOREIGN KEY (Id_Producto) REFERENCES dbo.Inv_Productos(Id_Producto),
        CONSTRAINT CK_Ven_Vales_Detalle_Cantidad CHECK (Cantidad > 0)
    );
END;

DECLARE @CajaId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'caja');
IF @CajaId IS NOT NULL
BEGIN
    MERGE dbo.Seg_Permisos AS target
    USING (VALUES
        (@CajaId, 'caja.retornables.configurar', N'Configurar productos retornables', N'Administra productos, precios, medios de pago y vigencia de vales.', CAST(1 AS bit)),
        (@CajaId, 'caja.retornables.canjear', N'Canjear vales de envases', N'Consulta y canjea vales de devolución desde Caja.', CAST(1 AS bit))
    ) source (IdModulo, Codigo, Nombre, Descripcion, EsCritico)
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET Id_Modulo=source.IdModulo, Nombre=source.Nombre, Descripcion=source.Descripcion, EsCritico=source.EsCritico, Activo=1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo,Codigo,Nombre,Descripcion,EsCritico,Activo)
        VALUES(source.IdModulo,source.Codigo,source.Nombre,source.Descripcion,source.EsCritico,1);

    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario,Id_Permiso,Activo,Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario,p.Id_Permiso,1,GETDATE()
    FROM dbo.Emp_Roles_Usuarios r CROSS JOIN dbo.Seg_Permisos p
    WHERE UPPER(r.Nombre_Rol)='ADMINISTRADOR' AND p.Codigo IN ('caja.retornables.configurar','caja.retornables.canjear')
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x WHERE x.Id_Rol_Usuario=r.Id_Rol_Usuario AND x.Id_Permiso=p.Id_Permiso);
END;

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
