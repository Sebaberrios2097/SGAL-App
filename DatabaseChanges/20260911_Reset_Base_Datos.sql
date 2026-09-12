/* ============================================================================
   RESET TOTAL DE LA BASE DE DATOS — Siete Vidas
   ----------------------------------------------------------------------------
   Vacía toda la data operacional, transaccional y maestra para "empezar de 0",
   conservando ÚNICAMENTE los catálogos que la aplicación referencia por Id fijo
   (estados, tipos, métodos de pago, unidades, denominaciones y el árbol de
   seguridad roles/módulos/permisos).

   Los usuarios se vacían por completo: al no encontrar ningún usuario
   Desarrollador (Tipo 1), el sistema mostrará el formulario de bootstrap para
   crear al primer usuario.

   Diseño:
     - Todo corre dentro de una transacción (rollback ante cualquier error).
     - Se deshabilitan las FKs de las tablas a vaciar, se borran, se reinician
       los IDENTITY y se vuelven a habilitar VALIDANDO (WITH CHECK).
     - El borrado y el reseed son dinámicos: se leen desde la lista @Wipe, así
       que no dependen del orden de las llaves foráneas ni de autorreferencias.

   IMPORTANTE: haz un respaldo antes de ejecutar. Esta operación es irreversible.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRAN;

    /* --------------------------------------------------------------------
       Tablas a VACIAR (35). Todo lo que NO esté aquí se conserva intacto.
       -------------------------------------------------------------------- */
    DECLARE @Wipe TABLE (Nombre SYSNAME PRIMARY KEY);
    INSERT INTO @Wipe (Nombre) VALUES
        -- Ventas
        ('Ven_Detalle_Venta_Ingredientes'),
        ('Ven_Detalle_Venta_Materiales'),
        ('Ven_Detalle_Venta'),
        ('Ven_Metodos_Pago_Venta'),
        ('Ven_Ordenes_Point'),
        ('Ven_Ventas'),
        -- Turnos / bitácora
        ('Tur_Turno_Desglose_Efectivo'),
        ('Tur_Turno_Desglose'),
        ('Tur_Productos_Bitacora_Materiales'),
        ('Tur_Productos_Bitacora'),
        ('Tur_Extracciones'),
        ('Tur_Bitacora'),
        ('Tur_Turno'),
        -- Inventario / maestro
        ('Inv_Orden_Detalle'),
        ('Inv_Orden_Compra'),
        ('Inv_Materiales_Receta'),
        ('Inv_Recetas'),
        ('Inv_Presentaciones_Materia_Prima'),
        ('Inv_Productos_Cortesia'),
        ('Inv_Configuracion_Cortesia'),
        ('Inv_Descuentos_Productos'),
        ('Inv_Ingredientes_Extra'),
        ('Inv_Productos'),
        ('Inv_Materia_Prima'),
        ('Inv_Categoria_Productos'),
        ('Inv_Categorias_Materia'),
        ('Inv_Marcas'),
        ('Inv_Proveedores'),
        -- SII (documentos/folios/clientes, NO los catálogos de estados/tipos)
        ('SII_Caf_Folios'),
        ('SII_Clientes_Empresa'),
        -- Seguridad / usuarios (los ROLES/PERMISOS se conservan)
        ('Aud_Accesos_Usuarios'),
        ('Emp_RolesXUsuario'),
        ('Emp_Empleados'),
        ('Emp_Usuarios');

    /* --------------------------------------------------------------------
       Validación: aborta si alguna tabla listada no existe (typo/rename).
       -------------------------------------------------------------------- */
    IF EXISTS (
        SELECT 1 FROM @Wipe w
        WHERE OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(w.Nombre), 'U') IS NULL
    )
    BEGIN
        DECLARE @faltantes NVARCHAR(MAX);
        SELECT @faltantes = STRING_AGG(w.Nombre, ', ')
        FROM @Wipe w
        WHERE OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(w.Nombre), 'U') IS NULL;
        DECLARE @msgErr NVARCHAR(2048) = N'Tablas inexistentes en la lista @Wipe: ' + @faltantes;
        THROW 50001, @msgErr, 1;
    END;

    DECLARE @sql NVARCHAR(MAX);
    DECLARE @t   SYSNAME;

    /* 1) Deshabilitar TODAS las FKs de las tablas a vaciar ---------------- */
    SET @sql = N'';
    SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME(w.Nombre) + N' NOCHECK CONSTRAINT ALL;' + CHAR(10)
    FROM @Wipe w;
    EXEC sys.sp_executesql @sql;

    /* 2) Borrar el contenido -------------------------------------------- */
    SET @sql = N'';
    SELECT @sql = @sql + N'DELETE FROM ' + QUOTENAME(w.Nombre) + N';' + CHAR(10)
    FROM @Wipe w;
    EXEC sys.sp_executesql @sql;

    /* 3) Reiniciar IDENTITY (solo tablas que tengan columna identidad) --- */
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT w.Nombre
        FROM @Wipe w
        WHERE EXISTS (
            SELECT 1 FROM sys.identity_columns ic
            WHERE ic.object_id = OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(w.Nombre))
        );
    OPEN cur;
    FETCH NEXT FROM cur INTO @t;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DBCC CHECKIDENT (@t, RESEED, 0) WITH NO_INFOMSGS;
        FETCH NEXT FROM cur INTO @t;
    END;
    CLOSE cur;
    DEALLOCATE cur;

    /* 4) Reactivar y VALIDAR las FKs ------------------------------------ */
    SET @sql = N'';
    SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME(w.Nombre) + N' WITH CHECK CHECK CONSTRAINT ALL;' + CHAR(10)
    FROM @Wipe w;
    EXEC sys.sp_executesql @sql;

    COMMIT;
    PRINT 'Reset completado. Catálogos conservados; data operacional/maestra/usuarios vaciada.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH;

/* ----------------------------------------------------------------------------
   Verificación posterior (opcional): conteo de filas por tabla.
   Debe mostrar 0 en las 35 tablas de @Wipe y >0 en los catálogos conservados.
   ----------------------------------------------------------------------------
SELECT  t.name AS Tabla,
        SUM(p.rows) AS Filas
FROM    sys.tables t
JOIN    sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
GROUP BY t.name
ORDER BY t.name;
---------------------------------------------------------------------------- */
