SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Inv_Formatos_Compra', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Inv_Formatos_Compra
    (
        Id_Formato_Compra INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Inv_Formatos_Compra PRIMARY KEY,
        Id_Producto INT NULL,
        Id_Materia_Prima INT NULL,
        Nombre_Formato NVARCHAR(100) NOT NULL,
        Cantidad_Contenido DECIMAL(18,3) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Inv_Formatos_Compra_Activo DEFAULT (1),
        Fecha_Creacion DATETIME2 NOT NULL CONSTRAINT DF_Inv_Formatos_Compra_Fecha DEFAULT (SYSDATETIME()),
        CONSTRAINT CK_Inv_Formatos_Compra_Tipo CHECK
        (
            (Id_Producto IS NOT NULL AND Id_Materia_Prima IS NULL)
            OR (Id_Producto IS NULL AND Id_Materia_Prima IS NOT NULL)
        ),
        CONSTRAINT CK_Inv_Formatos_Compra_Contenido CHECK (Cantidad_Contenido > 0),
        CONSTRAINT FK_Inv_Formatos_Compra_Producto FOREIGN KEY (Id_Producto) REFERENCES dbo.Inv_Productos(Id_Producto),
        CONSTRAINT FK_Inv_Formatos_Compra_Materia FOREIGN KEY (Id_Materia_Prima) REFERENCES dbo.Inv_Materia_Prima(Id_Materia_Prima)
    );

    CREATE UNIQUE INDEX UX_Inv_Formatos_Compra_Producto_Nombre
        ON dbo.Inv_Formatos_Compra(Id_Producto, Nombre_Formato)
        WHERE Id_Producto IS NOT NULL;
    CREATE UNIQUE INDEX UX_Inv_Formatos_Compra_Materia_Nombre
        ON dbo.Inv_Formatos_Compra(Id_Materia_Prima, Nombre_Formato)
        WHERE Id_Materia_Prima IS NOT NULL;

    INSERT dbo.Inv_Formatos_Compra (Id_Materia_Prima, Nombre_Formato, Cantidad_Contenido, Activo, Fecha_Creacion)
    SELECT p.Id_Materia_Prima,
           p.Nombre_Presentacion,
           ROUND(p.Cantidad_Contenido * unidadPresentacion.Factor_Conversion_Base / unidadInventario.Factor_Conversion_Base, 3),
           p.Activo,
           p.Fecha_Creacion
    FROM dbo.Inv_Presentaciones_Materia_Prima p
    INNER JOIN dbo.Inv_Materia_Prima m ON m.Id_Materia_Prima = p.Id_Materia_Prima
    INNER JOIN dbo.Inv_Unidades_Medida unidadPresentacion ON unidadPresentacion.Id_Unidad_Medida = p.Id_Unidad_Medida
    INNER JOIN dbo.Inv_Unidades_Medida unidadInventario ON unidadInventario.Id_Unidad_Medida = m.Id_Unidad_Medida;
END;

IF COL_LENGTH(N'dbo.Inv_Presentaciones_Materia_Prima', N'Id_Formato_Compra') IS NULL
    ALTER TABLE dbo.Inv_Presentaciones_Materia_Prima ADD Id_Formato_Compra INT NULL;

EXEC sys.sp_executesql N'
    UPDATE p
    SET Id_Formato_Compra = f.Id_Formato_Compra
    FROM dbo.Inv_Presentaciones_Materia_Prima p
    INNER JOIN dbo.Inv_Formatos_Compra f
        ON f.Id_Materia_Prima = p.Id_Materia_Prima
        AND f.Nombre_Formato = p.Nombre_Presentacion
    WHERE p.Id_Formato_Compra IS NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Inv_Presentaciones_Materia_Prima_Formato_Compra')
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.Inv_Presentaciones_Materia_Prima
        ADD CONSTRAINT FK_Inv_Presentaciones_Materia_Prima_Formato_Compra
        FOREIGN KEY (Id_Formato_Compra) REFERENCES dbo.Inv_Formatos_Compra(Id_Formato_Compra);';

IF COL_LENGTH(N'dbo.Inv_Orden_Detalle', N'Id_Formato_Compra') IS NULL
    ALTER TABLE dbo.Inv_Orden_Detalle ADD Id_Formato_Compra INT NULL;
IF COL_LENGTH(N'dbo.Inv_Orden_Detalle', N'Nombre_Formato') IS NULL
    ALTER TABLE dbo.Inv_Orden_Detalle ADD Nombre_Formato NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Inv_Orden_Detalle', N'Cantidad_Contenido_Formato') IS NULL
    ALTER TABLE dbo.Inv_Orden_Detalle ADD Cantidad_Contenido_Formato DECIMAL(18,3) NULL;
IF COL_LENGTH(N'dbo.Inv_Orden_Detalle', N'Unidad_Contenido_Formato') IS NULL
    ALTER TABLE dbo.Inv_Orden_Detalle ADD Unidad_Contenido_Formato NVARCHAR(20) NULL;

EXEC sys.sp_executesql
    N'UPDATE d
      SET [Nombre_Formato] = COALESCE(d.[Nombre_Formato], CASE WHEN d.[Id_Producto] IS NOT NULL THEN @formatoProducto ELSE @formatoMateria END),
          [Cantidad_Contenido_Formato] = COALESCE(d.[Cantidad_Contenido_Formato], CONVERT(DECIMAL(18,3), 1)),
          [Unidad_Contenido_Formato] = COALESCE(d.[Unidad_Contenido_Formato], CASE WHEN d.[Id_Producto] IS NOT NULL THEN @unidadProducto ELSE u.[Abreviacion] END)
      FROM dbo.[Inv_Orden_Detalle] d
      LEFT JOIN dbo.[Inv_Materia_Prima] m ON m.[Id_Materia_Prima] = d.[Id_Materia_Prima]
      LEFT JOIN dbo.[Inv_Unidades_Medida] u ON u.[Id_Unidad_Medida] = m.[Id_Unidad_Medida];',
    N'@formatoProducto NVARCHAR(100), @formatoMateria NVARCHAR(100), @unidadProducto NVARCHAR(20)',
    @formatoProducto = N'Unidad',
    @formatoMateria = N'Unidad de inventario',
    @unidadProducto = N'un';

EXEC sys.sp_executesql N'ALTER TABLE dbo.[Inv_Orden_Detalle] ALTER COLUMN [Nombre_Formato] NVARCHAR(100) NOT NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.[Inv_Orden_Detalle] ALTER COLUMN [Cantidad_Contenido_Formato] DECIMAL(18,3) NOT NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.[Inv_Orden_Detalle] ALTER COLUMN [Unidad_Contenido_Formato] NVARCHAR(20) NOT NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Inv_Orden_Detalle_Inv_Formatos_Compra')
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.Inv_Orden_Detalle
        ADD CONSTRAINT FK_Inv_Orden_Detalle_Inv_Formatos_Compra
        FOREIGN KEY (Id_Formato_Compra) REFERENCES dbo.Inv_Formatos_Compra(Id_Formato_Compra);';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Inv_Orden_Detalle_Contenido_Formato')
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.Inv_Orden_Detalle
        ADD CONSTRAINT CK_Inv_Orden_Detalle_Contenido_Formato
        CHECK (Cantidad_Contenido_Formato > 0);';

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
