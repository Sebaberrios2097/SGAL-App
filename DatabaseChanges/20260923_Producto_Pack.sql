/*
  Productos en pack: un producto (p. ej. sixpack, bandeja de 30 huevos) es un producto
  distinto (precio y SKU propios) que representa N unidades de un producto base.

  El pack NO tiene stock propio (Stock = NULL): su disponibilidad se calcula como
  piso(stock_base / cantidad_pack) y venderlo descuenta cantidad_pack × unidades del stock
  del producto base. Las compras/recepciones ingresan stock solo al producto base.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Inv_Productos', 'Es_Pack') IS NULL
        ALTER TABLE dbo.Inv_Productos ADD Es_Pack bit NOT NULL
            CONSTRAINT DF_Inv_Productos_Es_Pack DEFAULT (0) WITH VALUES;

    IF COL_LENGTH('dbo.Inv_Productos', 'Id_Producto_Base') IS NULL
        ALTER TABLE dbo.Inv_Productos ADD Id_Producto_Base int NULL;

    IF COL_LENGTH('dbo.Inv_Productos', 'Cantidad_Pack') IS NULL
        ALTER TABLE dbo.Inv_Productos ADD Cantidad_Pack int NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('dbo.Inv_Productos')
          AND name = 'FK_Inv_Productos_Producto_Base'
    )
        ALTER TABLE dbo.Inv_Productos WITH CHECK
        ADD CONSTRAINT FK_Inv_Productos_Producto_Base
            FOREIGN KEY (Id_Producto_Base) REFERENCES dbo.Inv_Productos(Id_Producto);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
