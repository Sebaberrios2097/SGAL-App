/*
  Permiso "Ingresar pago efectivo" (módulo Caja).

  Si un rol lo tiene, al cobrar en efectivo el cajero DEBE ingresar con cuánto le pagaron
  (para calcular el vuelto). Si no lo tiene, puede cobrar en efectivo sin indicarlo.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @CajaId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'caja');
    IF @CajaId IS NULL THROW 51020, 'No existe el módulo Caja; aplique primero 20260921_Modulo_Caja.sql.', 1;

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @CajaId AS Id_Modulo,
                  'caja.pago.efectivo.ingresar' AS Codigo,
                  N'Ingresar pago efectivo' AS Nombre,
                  N'Obliga a registrar el efectivo recibido para calcular el vuelto al cobrar en efectivo.' AS Descripcion,
                  CONVERT(bit, 0) AS EsCritico) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET
        Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Codigo = 'caja.pago.efectivo.ingresar'
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
