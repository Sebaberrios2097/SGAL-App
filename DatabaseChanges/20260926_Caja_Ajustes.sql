/*
  Ajustes del módulo Caja.

    - Caja_Mostrar_Botones_Efectivo: si es 1 (por defecto), la Caja muestra los
      botones de pago rápido y de denominaciones al cobrar en efectivo; si es 0,
      se ocultan ambas secciones para un cobro más simple.
    - Caja_Requiere_Cuadratura: si es 1 (por defecto), el turno de caja pide la
      apertura de efectivo al iniciar y el arqueo al cerrar; si es 0, se abre y
      cierra sin cuadratura. Es independiente de la cuadratura del Punto de venta.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Caja_Mostrar_Botones_Efectivo') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Caja_Mostrar_Botones_Efectivo bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Caja_Mostrar_Botones_Efectivo DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Caja_Requiere_Cuadratura') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Caja_Requiere_Cuadratura bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Caja_Requiere_Cuadratura DEFAULT (1) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
