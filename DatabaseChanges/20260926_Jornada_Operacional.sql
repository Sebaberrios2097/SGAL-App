SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.Org_Configuracion', 'Caja_Propinas_Habilitadas') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Caja_Propinas_Habilitadas bit NOT NULL
        CONSTRAINT DF_Org_Configuracion_Caja_Propinas DEFAULT (0) WITH VALUES;

IF COL_LENGTH('dbo.Org_Configuracion', 'Jornada_Hora_Apertura') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Jornada_Hora_Apertura time NOT NULL
        CONSTRAINT DF_Org_Configuracion_Jornada_Apertura DEFAULT ('06:00') WITH VALUES;

IF COL_LENGTH('dbo.Org_Configuracion', 'Jornada_Hora_Cierre') IS NULL
    ALTER TABLE dbo.Org_Configuracion ADD Jornada_Hora_Cierre time NOT NULL
        CONSTRAINT DF_Org_Configuracion_Jornada_Cierre DEFAULT ('02:00') WITH VALUES;

DECLARE @VentasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');
IF @VentasId IS NOT NULL
BEGIN
    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @VentasId IdModulo, 'operacion_diaria.ver' Codigo,
        N'Ver operación diaria' Nombre, N'Consulta ventas y movimientos de turnos de la jornada operacional.' Descripcion) source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET Id_Modulo = source.IdModulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = 0, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.IdModulo, source.Codigo, source.Nombre, source.Descripcion, 0, 1);

    DECLARE @PermisoId int = (SELECT Id_Permiso FROM dbo.Seg_Permisos WHERE Codigo = 'operacion_diaria.ver');
    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT role.Id_Rol_Usuario, @PermisoId, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios role
    WHERE @PermisoId IS NOT NULL AND UPPER(role.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol grantRow
          WHERE grantRow.Id_Rol_Usuario = role.Id_Rol_Usuario AND grantRow.Id_Permiso = @PermisoId);

    IF OBJECT_ID('dbo.Org_Permisos', 'U') IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.Org_Modulos WHERE Id_Modulo = @VentasId AND Todas_Funcionalidades = 0)
       AND NOT EXISTS (SELECT 1 FROM dbo.Org_Permisos WHERE Id_Permiso = @PermisoId)
        INSERT INTO dbo.Org_Permisos (Id_Permiso, Fecha_Actualizacion) VALUES (@PermisoId, SYSUTCDATETIME());
END;

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
