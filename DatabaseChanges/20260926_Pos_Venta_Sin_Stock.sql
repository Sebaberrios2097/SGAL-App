/*
  Ajuste del Punto de venta: permitir vender un producto aunque el sistema
  indique que no tiene stock disponible.

    - Pos_Permitir_Venta_Sin_Stock: si es 1, la venta procede aunque el stock
      quede en negativo; si es 0 (por defecto), se bloquea la venta sin stock.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Permitir_Venta_Sin_Stock') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Permitir_Venta_Sin_Stock bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Venta_Sin_Stock DEFAULT (0) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
