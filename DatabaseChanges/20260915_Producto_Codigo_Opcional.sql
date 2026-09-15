SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- El código de producto pasa a ser opcional. Se permite NULL y se reemplaza el
-- índice único por uno filtrado, de modo que puedan existir varios productos sin
-- código pero los códigos presentes sigan siendo únicos.
-- ---------------------------------------------------------------------------

-- Quita el índice único original (si existe).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Inv_Productos_Codigo_Producto'
           AND object_id = OBJECT_ID('dbo.Inv_Productos'))
    DROP INDEX UX_Inv_Productos_Codigo_Producto ON dbo.Inv_Productos;

-- Permite NULL en el código.
IF COL_LENGTH('dbo.Inv_Productos', 'Codigo_Producto') IS NOT NULL
    ALTER TABLE dbo.Inv_Productos ALTER COLUMN Codigo_Producto VARCHAR(50) NULL;

-- Índice único filtrado: unicidad solo entre los códigos no nulos.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Inv_Productos_Codigo_Producto'
               AND object_id = OBJECT_ID('dbo.Inv_Productos'))
    CREATE UNIQUE INDEX UX_Inv_Productos_Codigo_Producto
        ON dbo.Inv_Productos (Codigo_Producto)
        WHERE Codigo_Producto IS NOT NULL;

COMMIT TRANSACTION;
