/* Anulación de vales pendientes desde Caja, con motivo opcional e historial. */

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Ven_Ventas', 'Motivo_Anulacion') IS NULL
        ALTER TABLE dbo.Ven_Ventas ADD Motivo_Anulacion nvarchar(300) NULL;

    IF COL_LENGTH('dbo.Ven_Ventas', 'Fecha_Anulacion') IS NULL
        ALTER TABLE dbo.Ven_Ventas ADD Fecha_Anulacion datetime NULL;

    DECLARE @CajaId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'caja');
    IF @CajaId IS NULL THROW 51020, 'No existe el módulo Caja.', 1;

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @CajaId AS Id_Modulo, 'caja.venta.anular' AS Codigo,
        N'Anular ventas en caja' AS Nombre,
        N'Anula un vale pendiente, repone el stock y conserva el registro en el historial.' AS Descripcion,
        CAST(1 AS bit) AS EsCritico) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Codigo = 'caja.venta.anular'
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
