/* ============================================================================
   RESET TOTAL DE LA BASE DE DATOS — SGAL App  (deja la instalación "como nueva")
   ----------------------------------------------------------------------------
   Vacía ABSOLUTAMENTE TODO —data operacional, transaccional, maestra, usuarios,
   logos y fondos personalizados— y restablece la identidad de la organización a
   sus valores por defecto, conservando ÚNICAMENTE los datos básicos que la
   aplicación necesita para funcionar:

     - Catálogos referenciados por Id fijo (estados, tipos, métodos de pago,
       unidades y denominaciones).
     - El árbol de seguridad: roles, módulos, permisos, dependencias entre
       módulos y la asignación permiso-rol.

   Tras el reset no queda ningún usuario: al no existir un Desarrollador (Tipo 1)
   el sistema mostrará el formulario de bootstrap para crear el primer usuario.

   Diseño:
     - Se conserva SOLO lo que está en @Keep; todo lo demás (cualquier otra tabla
       de usuario en dbo, incluso nuevas) se vacía. Esto garantiza que no quede
       data antigua aunque se agreguen tablas en el futuro.
     - Se corre dentro de una transacción (rollback ante cualquier error).
     - Se deshabilitan las FKs de las tablas a vaciar, se borran, se reinician
       los IDENTITY y se reactivan VALIDANDO (WITH CHECK).
     - Luego se re-siembra Org_Configuracion (identidad por defecto),
       Org_Fondos (4 zonas sin imagen) y Org_Modulos (todos los módulos activos
       habilitados), replicando el estado inicial de una instalación nueva.

   IMPORTANTE: haz un respaldo antes de ejecutar. Esta operación es irreversible.

   PRERREQUISITO: aplica primero todas las migraciones de DatabaseChanges (hasta
   20260919_Fondo_Login.sql). La re-siembra asume el esquema vigente; si una tabla
   de organización aún no existe, se omite su re-siembra sin fallar.
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRAN;

    /* --------------------------------------------------------------------
       Tablas a CONSERVAR. Todo lo que NO esté aquí se vacía.
       -------------------------------------------------------------------- */
    DECLARE @Keep TABLE (Nombre SYSNAME PRIMARY KEY);
    INSERT INTO @Keep (Nombre) VALUES
        -- Catálogos referenciados por Id fijo
        ('Ven_Estados_Ventas'),
        ('Ven_Metodos_Pago'),
        ('Tur_Estados_Turnos'),
        ('Tur_Tipos_Movimientos'),
        ('Tur_Denominaciones'),
        ('Inv_Estados_Orden_Compra'),
        ('Inv_Unidades_Medida'),
        ('SII_Estados_Boleta'),
        ('SII_Tipos_DTE'),
        -- Árbol de seguridad (roles, módulos, permisos y sus relaciones)
        ('Emp_Roles_Usuarios'),
        ('Seg_Modulos'),
        ('Seg_Modulos_Dependencias'),
        ('Seg_Permisos'),
        ('Seg_PermisosXRol');

    /* Validación: aborta si algún catálogo listado no existe (typo/rename),
       para no vaciarlo por accidente al no reconocerlo. */
    IF EXISTS (
        SELECT 1 FROM @Keep k
        WHERE OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(k.Nombre), 'U') IS NULL
    )
    BEGIN
        DECLARE @faltantes NVARCHAR(MAX);
        SELECT @faltantes = STRING_AGG(k.Nombre, ', ')
        FROM @Keep k
        WHERE OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(k.Nombre), 'U') IS NULL;
        DECLARE @msgErr NVARCHAR(2048) = N'Catálogos inexistentes en la lista @Keep: ' + @faltantes;
        THROW 50001, @msgErr, 1;
    END;

    /* --------------------------------------------------------------------
       Conjunto a VACIAR = todas las tablas de usuario en dbo, menos @Keep.
       -------------------------------------------------------------------- */
    DECLARE @Wipe TABLE (Nombre SYSNAME PRIMARY KEY);
    INSERT INTO @Wipe (Nombre)
    SELECT t.name
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = 'dbo'
      AND t.is_ms_shipped = 0
      AND t.name <> 'sysdiagrams'
      AND t.name NOT IN (SELECT Nombre FROM @Keep);

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

    /* --------------------------------------------------------------------
       5) Re-sembrar la configuración de la organización (estado inicial).
       -------------------------------------------------------------------- */

    -- Identidad visual por defecto (fila única Id = 1).
    IF OBJECT_ID('dbo.Org_Configuracion', 'U') IS NOT NULL
        INSERT INTO dbo.Org_Configuracion
            (Id_Configuracion, Nombre_Comercial, Descripcion, Texto_Pie_Documentos, Color_Primario,
             Color_Secundario, Color_Acento, Color_Fondo, Fecha_Actualizacion)
        VALUES
            (1, N'SGAL App', N'Sistema de Gestión, Administración y Logística', N'Gracias por su preferencia.',
             '#1F4E5F', '#163A47', '#D97706', '#F8FAFC', SYSUTCDATETIME());

    -- Fondos por zona: sin imagen y deshabilitados. Se normaliza la restricción de
    -- zonas para incluir 'login' aunque la migración 20260919 aún no se haya
    -- aplicado, de modo que el reset funcione en cualquier estado del esquema.
    IF OBJECT_ID('dbo.Org_Fondos', 'U') IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = 'CK_Org_Fondos_Zona'
                     AND parent_object_id = OBJECT_ID('dbo.Org_Fondos'))
            ALTER TABLE dbo.Org_Fondos DROP CONSTRAINT CK_Org_Fondos_Zona;

        ALTER TABLE dbo.Org_Fondos ADD CONSTRAINT CK_Org_Fondos_Zona
            CHECK (Zona IN ('login', 'sidebar', 'ventas', 'comandas', 'carta'));

        INSERT INTO dbo.Org_Fondos (Zona, Habilitado)
        VALUES ('login', 0), ('sidebar', 0), ('ventas', 0), ('comandas', 0), ('carta', 0);
    END;

    -- Módulos: todos los módulos activos quedan habilitados (como una instalación
    -- recién migrada). Ajusta aquí si prefieres habilitar solo un subconjunto.
    IF OBJECT_ID('dbo.Org_Modulos', 'U') IS NOT NULL
        INSERT INTO dbo.Org_Modulos (Id_Modulo, Habilitado, Fecha_Actualizacion)
        SELECT m.Id_Modulo, 1, SYSUTCDATETIME()
        FROM dbo.Seg_Modulos m
        WHERE m.Activo = 1;

    COMMIT;
    PRINT 'Reset completado. Catálogos y seguridad conservados; todo lo demás vaciado y la organización restablecida.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH;

/* ----------------------------------------------------------------------------
   Verificación posterior (opcional): conteo de filas por tabla.
   Los catálogos/seguridad deben mostrar >0; el resto 0 (salvo Org_Configuracion=1,
   Org_Fondos=4 y Org_Modulos = módulos activos).
   ----------------------------------------------------------------------------
SELECT  t.name AS Tabla,
        SUM(p.rows) AS Filas
FROM    sys.tables t
JOIN    sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
GROUP BY t.name
ORDER BY t.name;
---------------------------------------------------------------------------- */
