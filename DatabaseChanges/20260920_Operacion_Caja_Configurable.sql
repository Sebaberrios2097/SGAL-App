/*
  Fusiona Ventas, Turnos y Bitácora en el módulo comercial "Operación de caja".
  La cuadratura y las calibraciones de cafetería quedan configurables por instalación.
  Comandas continúa como módulo opcional dependiente de Operación de caja y Recetas.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Turnos_Requieren_Cuadratura') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Turnos_Requieren_Cuadratura bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Turnos_Cuadratura DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Bitacora_Incluye_Calibracion') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Bitacora_Incluye_Calibracion bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Bitacora_Calibracion DEFAULT (1) WITH VALUES;

    IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'comandas')
        INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Descripcion, Orden, Activo, Es_Nucleo)
        VALUES ('comandas', N'Comandas',
            N'Preparación y seguimiento de pedidos a partir de las recetas de los productos.',
            80, 1, 0);
    ELSE
        UPDATE dbo.Seg_Modulos
        SET Nombre = N'Comandas',
            Descripcion = N'Preparación y seguimiento de pedidos a partir de las recetas de los productos.',
            Orden = 80, Activo = 1, Es_Nucleo = 0
        WHERE Codigo = 'comandas';

    UPDATE dbo.Seg_Modulos
    SET Nombre = N'Operación de caja',
        Descripcion = N'Ventas, turnos, cuadratura configurable, bitácora, consumos de empleados y control administrativo por turno.',
        Orden = 60, Activo = 1, Es_Nucleo = 0
    WHERE Codigo = 'ventas';

    UPDATE dbo.Seg_Modulos
    SET Activo = 0, Es_Nucleo = 0
    WHERE Codigo IN ('turnos', 'bitacora');

    DECLARE @OperacionId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');
    DECLARE @TurnosId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'turnos');
    DECLARE @BitacoraId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'bitacora');
    DECLARE @InventarioId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'inventario');
    DECLARE @RecetasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'recetas');
    DECLARE @ComandasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'comandas');

    IF @OperacionId IS NULL OR @InventarioId IS NULL OR @RecetasId IS NULL OR @ComandasId IS NULL
        THROW 51002, 'No fue posible configurar el módulo Operación de caja.', 1;

    /* Todo el ciclo comercial pertenece a una sola frontera funcional. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @OperacionId
    WHERE Codigo LIKE 'ventas.%'
       OR Codigo LIKE 'turnos.%'
       OR Codigo LIKE 'bitacora.%'
       OR Codigo LIKE 'registros_turnos.%'
       OR Codigo LIKE 'configuracion_inventario.cortesia.%'
       OR Codigo LIKE 'inventario.descuentos.%'
       OR Codigo = 'inicio.dashboard.ver';

    UPDATE dbo.Seg_Permisos SET Id_Modulo = @ComandasId
    WHERE Codigo LIKE 'ventas.comandas.%';

    DELETE FROM dbo.Seg_Modulos_Dependencias
    WHERE Id_Modulo IN (@OperacionId, @TurnosId, @BitacoraId, @ComandasId);

    INSERT INTO dbo.Seg_Modulos_Dependencias (Id_Modulo, Id_Modulo_Requerido)
    VALUES (@OperacionId, @InventarioId),
           (@ComandasId, @OperacionId),
           (@ComandasId, @RecetasId);

    DECLARE @OperacionHabilitada bit = CASE WHEN EXISTS (
        SELECT 1 FROM dbo.Org_Modulos configuration
        WHERE configuration.Habilitado = 1
          AND configuration.Id_Modulo IN (@OperacionId, @TurnosId, @BitacoraId)
    ) THEN 1 ELSE 0 END;
    DECLARE @RecetasHabilitadas bit = CASE WHEN EXISTS (
        SELECT 1 FROM dbo.Org_Modulos WHERE Id_Modulo = @RecetasId AND Habilitado = 1
    ) THEN 1 ELSE 0 END;

    MERGE dbo.Org_Modulos AS target
    USING (VALUES
        (@OperacionId, @OperacionHabilitada),
        (@ComandasId, CONVERT(bit, CASE WHEN @OperacionHabilitada = 1 AND @RecetasHabilitadas = 1 THEN 1 ELSE 0 END))
    ) AS source (Id_Modulo, Habilitado)
    ON source.Id_Modulo = target.Id_Modulo
    WHEN MATCHED THEN UPDATE SET Habilitado = source.Habilitado, Fecha_Actualizacion = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Habilitado, Fecha_Actualizacion)
        VALUES (source.Id_Modulo, source.Habilitado, SYSUTCDATETIME());

    UPDATE dbo.Org_Modulos
    SET Habilitado = 0, Fecha_Actualizacion = SYSUTCDATETIME()
    WHERE Id_Modulo IN (@TurnosId, @BitacoraId);

    /* Sin Recetas, todo producto usa stock simple y parte en cero si no lo tenía. */
    IF @RecetasHabilitadas = 0
    BEGIN
        UPDATE dbo.Inv_Productos
        SET Stock = ISNULL(Stock, 0), Requiere_Receta = 0, Acepta_Ingredientes_Extra = 0,
            Fecha_Modificacion = GETDATE();
        UPDATE dbo.Inv_Recetas SET Estado = 0, Fecha_Modificacion = GETDATE() WHERE Estado = 1;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
