/*
  Cobro con tarjeta (Point/POS) en la caja.

  Marca las órdenes Point iniciadas desde la caja (Es_Caja). El webhook de Mercado Pago
  NO finaliza esas ventas por su cuenta: el vale se cobra explícitamente en la caja una vez
  que la terminal aprueba, para poder registrar el turno de caja y el pago dividido completo.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Ven_Ordenes_Point', 'Es_Caja') IS NULL
        ALTER TABLE dbo.Ven_Ordenes_Point ADD Es_Caja bit NOT NULL
            CONSTRAINT DF_Ven_Ordenes_Point_Es_Caja DEFAULT (0) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
