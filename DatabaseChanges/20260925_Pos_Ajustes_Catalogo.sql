/*
  Ajustes de presentación del catálogo en el Punto de venta.

  Permiten a la organización elegir cómo se muestran los productos al vender:
    - Pos_Agrupar_Por_Categoria: agrupar por categoría (1) o lista única (0).
    - Pos_Orden_Productos: al no agrupar, campo de orden — nombre | precio | vendidos | stock.
    - Pos_Orden_Direccion: dirección del orden — asc | desc.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Agrupar_Por_Categoria') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Agrupar_Por_Categoria bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Agrupar DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Orden_Productos') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Orden_Productos varchar(20) NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Orden DEFAULT ('nombre') WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Orden_Direccion') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Orden_Direccion varchar(4) NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Direccion DEFAULT ('asc') WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
