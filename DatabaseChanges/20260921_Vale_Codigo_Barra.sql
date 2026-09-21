/*
  Opción para imprimir un código de barras (Code39) en el ticket interno (vale).

  El código codifica el número de venta y permite reescanear el ticket:
    - el vendedor recupera el carrito para modificar el vale pendiente;
    - el cajero carga la venta en el carrito de la caja.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Vale_Incluye_Codigo_Barra') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Vale_Incluye_Codigo_Barra bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Vale_Codigo_Barra DEFAULT (0) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
