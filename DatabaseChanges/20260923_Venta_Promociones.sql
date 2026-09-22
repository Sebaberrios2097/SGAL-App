/*
  Persistencia de promociones aplicadas en una venta.

  Cada instancia de promoción vendida guarda su precio de promo, el valor de los productos
  por separado (Monto_Individual) y el descuento resultante. Las líneas de detalle de esa
  instancia se etiquetan con Id_Venta_Promocion (conservan sus productos para stock/anulación).
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Ven_Venta_Promociones', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Ven_Venta_Promociones (
            Id_Venta_Promocion int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Venta_Promociones PRIMARY KEY,
            Id_Venta int NOT NULL,
            Id_Promocion int NOT NULL,
            Cantidad int NOT NULL CONSTRAINT DF_Ven_Venta_Promociones_Cantidad DEFAULT (1),
            Precio int NOT NULL,
            Monto_Individual int NOT NULL,
            Descuento int NOT NULL,
            CONSTRAINT FK_Ven_Venta_Promociones_Venta FOREIGN KEY (Id_Venta)
                REFERENCES dbo.Ven_Ventas(Id_Venta) ON DELETE CASCADE,
            CONSTRAINT FK_Ven_Venta_Promociones_Promocion FOREIGN KEY (Id_Promocion)
                REFERENCES dbo.Ven_Promociones(Id_Promocion)
        );
        CREATE INDEX IX_Ven_Venta_Promociones_Id_Venta ON dbo.Ven_Venta_Promociones (Id_Venta);
    END;

    IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Id_Venta_Promocion') IS NULL
        ALTER TABLE dbo.Ven_Detalle_Venta ADD Id_Venta_Promocion int NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('dbo.Ven_Detalle_Venta')
          AND name = 'FK_Ven_Detalle_Venta_Venta_Promocion'
    )
        EXEC(N'ALTER TABLE dbo.Ven_Detalle_Venta WITH CHECK
        ADD CONSTRAINT FK_Ven_Detalle_Venta_Venta_Promocion
            FOREIGN KEY (Id_Venta_Promocion) REFERENCES dbo.Ven_Venta_Promociones(Id_Venta_Promocion);');

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.Ven_Detalle_Venta')
          AND name = 'IX_Ven_Detalle_Venta_Id_Venta_Promocion'
    )
        -- SQL dinámico: la columna puede haber sido agregada unas líneas antes en este
        -- mismo lote y SQL Server resuelve los nombres del CREATE INDEX al compilarlo.
        EXEC(N'CREATE INDEX IX_Ven_Detalle_Venta_Id_Venta_Promocion
            ON dbo.Ven_Detalle_Venta (Id_Venta_Promocion)
            WHERE Id_Venta_Promocion IS NOT NULL;');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
