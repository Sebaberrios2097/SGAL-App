SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Café por calibración: bandera en la materia prima. La materia marcada toma
-- su cantidad en las recetas de la última extracción (calibración) del turno
-- abierto, en lugar de una cantidad fija. Solo una materia prima debería estar
-- marcada a la vez; esa unicidad se valida en la aplicación.
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Es_Cafe_Calibrable') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima
        ADD Es_Cafe_Calibrable bit NOT NULL
            CONSTRAINT DF_Inv_Materia_Prima_Es_Cafe_Calibrable DEFAULT (0);

-- ---------------------------------------------------------------------------
-- Preparación base: una receta puede apoyarse en otra preparación (producto
-- con receta) como base y solo añadir sus modificaciones. El vínculo es vivo.
-- NO ACTION en la FK; los ciclos se validan en la aplicación.
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Producto_Base') IS NULL
    ALTER TABLE dbo.Inv_Recetas ADD Id_Producto_Base int NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_Inv_Recetas_Inv_Productos_Base'
      AND parent_object_id = OBJECT_ID('dbo.Inv_Recetas'))
    ALTER TABLE dbo.Inv_Recetas
        ADD CONSTRAINT FK_Inv_Recetas_Inv_Productos_Base
            FOREIGN KEY (Id_Producto_Base) REFERENCES dbo.Inv_Productos (Id_Producto);

COMMIT TRANSACTION;
