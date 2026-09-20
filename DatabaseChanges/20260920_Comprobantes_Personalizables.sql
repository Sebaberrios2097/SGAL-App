/*
  Personalización del comprobante (boleta/vale de uso interno).

  La instalación decide qué información opcional se muestra además de la base
  (fecha, logo, productos, cantidades y subtotales con descuentos):
    - Nombre del vendedor/cajero que atendió.
    - Detalle del método de pago y vuelto.
    - Una cola de comprobante propia, independiente del "Mensaje al pie de
      documentos" (Texto_Pie_Documentos) de la identidad de la empresa.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Boleta_Muestra_Vendedor') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Boleta_Muestra_Vendedor bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Boleta_Muestra_Vendedor DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Boleta_Muestra_Pago') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Boleta_Muestra_Pago bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Boleta_Muestra_Pago DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Boleta_Cola_Personalizada') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Boleta_Cola_Personalizada nvarchar(250) NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
