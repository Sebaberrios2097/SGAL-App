/* ============================================================================
   Importación de productos, categorías y marcas desde BotiApp hacia SGAL.

   Requisitos:
     - Ambas bases en la MISMA instancia SQL Server (restaura el .bak de BotiApp).
     - Las tablas destino de productos/categorías/marcas deben estar VACÍAS:
       se preservan los IDs de origen con IDENTITY_INSERT.

   Mapeo origen -> destino:
     Pro_Tipos_Productos  -> Inv_Categoria_Productos   (Id + Nombre; el resto por defecto)
     Pro_Marcas           -> Inv_Marcas_Producto       (tabla NUEVA, marcas de producto)
     Pro_Productos        -> Inv_Productos             (+ nueva columna Id_Marca)

   Nota de marcas: en SGAL, [Inv_Marcas] pertenece a la materia prima. Para no
   mezclar ambos catálogos (ni chocar IDs al importar materia prima después), las
   marcas de PRODUCTO viven en su propia tabla [Inv_Marcas_Producto], referenciada
   por [Inv_Productos].[Id_Marca].

   ⚠️ Ajusta solo el nombre de la base destino en el USE.
   ============================================================================ */

USE [SGAL];   -- ⚠️ nombre real de la base DESTINO
GO

/* =====================================================================
   PARTE A — Esquema: tabla de marcas de producto + columna FK.
   (Idempotente: se puede correr más de una vez sin error.)
   ===================================================================== */

IF OBJECT_ID('[dbo].[Inv_Marcas_Producto]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Inv_Marcas_Producto] (
        [Id_Marca]      INT IDENTITY(1,1) NOT NULL,
        [Nombre_Marca]  NVARCHAR(100)     NOT NULL,
        [Activo]        BIT               NOT NULL
            CONSTRAINT [DF_Inv_Marcas_Producto_Activo] DEFAULT (1),
        CONSTRAINT [PK_Inv_Marcas_Producto] PRIMARY KEY ([Id_Marca])
    );
END
GO

IF COL_LENGTH('[dbo].[Inv_Productos]', 'Id_Marca') IS NULL
BEGIN
    ALTER TABLE [dbo].[Inv_Productos] ADD [Id_Marca] INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Inv_Productos_Inv_Marcas_Producto')
BEGIN
    ALTER TABLE [dbo].[Inv_Productos]
        ADD CONSTRAINT [FK_Inv_Productos_Inv_Marcas_Producto]
        FOREIGN KEY ([Id_Marca]) REFERENCES [dbo].[Inv_Marcas_Producto]([Id_Marca]);
END
GO

/* =====================================================================
   PARTE B — Datos: importación en una transacción atómica.
   ===================================================================== */
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRAN;

/* Guarda: las tablas destino deben estar vacías para preservar IDs. */
IF EXISTS (SELECT 1 FROM [dbo].[Inv_Categoria_Productos])
   OR EXISTS (SELECT 1 FROM [dbo].[Inv_Marcas_Producto])
   OR EXISTS (SELECT 1 FROM [dbo].[Inv_Productos])
BEGIN
    RAISERROR('Las tablas destino no están vacías. Aborta para no colisionar IDs.', 16, 1);
    ROLLBACK TRAN;
    RETURN;
END

/* -------------------- 1) CATEGORÍAS (desde tipos) --------------------
   Origen solo trae Id + Nombre. El resto de columnas de SGAL toman valor
   por defecto: sin receta, ingreso = ahora, activa, sin fecha de modificación. */
SET IDENTITY_INSERT [dbo].[Inv_Categoria_Productos] ON;
INSERT INTO [dbo].[Inv_Categoria_Productos]
    ([Id_Categoria_Producto], [Nombre_Categoria_Producto], [Requiere_Receta], [Fecha_Ingreso], [Activo], [Fecha_Modificacion])
SELECT
    t.[Id_Tipo_Producto],
    LEFT(t.[Nombre_Tipo_Producto], 100),
    0,             -- Requiere_Receta: reventa, sin receta (no viene en origen)
    GETDATE(),     -- Fecha_Ingreso: valor por defecto (no viene en origen)
    1,             -- Activo: por defecto (no viene en origen)
    NULL           -- Fecha_Modificacion: no viene en origen
FROM [BotiApp].[dbo].[Pro_Tipos_Productos] t;
SET IDENTITY_INSERT [dbo].[Inv_Categoria_Productos] OFF;

/* ------------------- 2) MARCAS DE PRODUCTO ------------------- */
SET IDENTITY_INSERT [dbo].[Inv_Marcas_Producto] ON;
INSERT INTO [dbo].[Inv_Marcas_Producto] ([Id_Marca], [Nombre_Marca], [Activo])
SELECT
    m.[Id_Marca],
    LEFT(m.[Nombre_Marca], 100),
    m.[Estado]     -- bit -> bit directo
FROM [BotiApp].[dbo].[Pro_Marcas] m;
SET IDENTITY_INSERT [dbo].[Inv_Marcas_Producto] OFF;

/* --------------------------- 3) PRODUCTOS --------------------------- */
SET IDENTITY_INSERT [dbo].[Inv_Productos] ON;

;WITH src AS (
    SELECT
        p.[Id_Producto],
        p.[Id_Tipo_Producto],
        p.[Id_Marca],
        p.[Nombre_Producto],
        p.[Descripción]     AS Descripcion,
        p.[Precio],
        p.[Stock],
        p.[Estado],
        p.[Imagen],
        p.[Fecha_Ingreso],
        -- Código: recorte a 50 (destino) y vacío -> NULL.
        NULLIF(LEFT(LTRIM(RTRIM(p.[Codigo])), 50), '') AS Cod,
        -- Detecta duplicados de código para no romper el índice único filtrado.
        ROW_NUMBER() OVER (
            PARTITION BY NULLIF(LEFT(LTRIM(RTRIM(p.[Codigo])), 50), '')
            ORDER BY p.[Id_Producto]
        ) AS rn
    FROM [BotiApp].[dbo].[Pro_Productos] p
)
INSERT INTO [dbo].[Inv_Productos]
    ([Id_Producto], [Id_Categoria_Producto], [Id_Marca], [Codigo_Producto], [Nombre_Producto],
     [Descripcion_Producto], [Imagen], [Precio], [Stock],
     [Es_Pack], [Id_Producto_Base], [Cantidad_Pack],
     [Requiere_Receta], [Acepta_Ingredientes_Extra],
     [Fecha_Ingreso], [Activo], [Fecha_Modificacion])
SELECT
    s.[Id_Producto],
    s.[Id_Tipo_Producto],                                  -- Tipo -> Categoría
    s.[Id_Marca],                                          -- Marca -> Inv_Marcas_Producto
    CASE WHEN s.Cod IS NOT NULL AND s.rn > 1 THEN NULL     -- código duplicado -> NULL
         ELSE s.Cod END,
    LEFT(s.[Nombre_Producto], 150),
    LEFT(s.Descripcion, 300),
    s.[Imagen],                                            -- varbinary(max) directo
    CAST(ROUND(s.[Precio], 0) AS int),                     -- Precio destino es int
    s.[Stock],
    0, NULL, NULL,                                         -- no packs (no viene en origen)
    0,                                                     -- reventa: sin receta
    0,                                                     -- sin ingredientes extra (no viene en origen)
    ISNULL(s.[Fecha_Ingreso], GETDATE()),
    s.[Estado],                                            -- bit -> Activo
    NULL                                                   -- Fecha_Modificacion: no viene en origen
FROM src s;
SET IDENTITY_INSERT [dbo].[Inv_Productos] OFF;

/* Ajusta el sembrador de identidad al máximo insertado. */
DBCC CHECKIDENT ('[dbo].[Inv_Categoria_Productos]', RESEED);
DBCC CHECKIDENT ('[dbo].[Inv_Marcas_Producto]',     RESEED);
DBCC CHECKIDENT ('[dbo].[Inv_Productos]',           RESEED);

/* Resumen de la carga. */
SELECT
    (SELECT COUNT(*) FROM [dbo].[Inv_Categoria_Productos]) AS Categorias,
    (SELECT COUNT(*) FROM [dbo].[Inv_Marcas_Producto])    AS Marcas,
    (SELECT COUNT(*) FROM [dbo].[Inv_Productos])          AS Productos,
    (SELECT COUNT(*) FROM [dbo].[Inv_Productos] WHERE [Imagen] IS NOT NULL) AS ConImagen,
    (SELECT COUNT(*) FROM [dbo].[Inv_Productos] WHERE [Codigo_Producto] IS NULL) AS SinCodigo;

COMMIT;
GO
