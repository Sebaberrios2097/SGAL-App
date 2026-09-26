/*
  Stock mínimo configurable para alertas de bajo stock.

  - `Inv_Productos.Stock_Minimo`: umbral propio del producto (NULL = usar el default global).
  - `Org_Configuracion.Stock_Minimo_Default`: umbral por defecto de la instalación (parte en 5),
    usado cuando un producto no define el suyo.

  Reemplaza el umbral hardcodeado (stock <= 5) del panel de inventario por uno configurable
  por producto con respaldo global.
*/

IF COL_LENGTH('dbo.Inv_Productos', 'Stock_Minimo') IS NULL
    ALTER TABLE dbo.Inv_Productos ADD Stock_Minimo int NULL;
GO

IF COL_LENGTH('dbo.Org_Configuracion', 'Stock_Minimo_Default') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Stock_Minimo_Default int NOT NULL
        CONSTRAINT DF_Org_Configuracion_Stock_Minimo_Default DEFAULT (5) WITH VALUES;
GO
