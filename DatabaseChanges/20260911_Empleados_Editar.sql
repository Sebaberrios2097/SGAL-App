SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE dbo.Seg_Modulos
SET Nombre = N'Empleados'
WHERE Codigo = 'usuarios';

UPDATE dbo.Seg_Permisos
SET Nombre = N'Ver empleados'
WHERE Codigo = 'usuarios.ver';

DECLARE @ModuloUsuarios int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'usuarios');

MERGE dbo.Seg_Permisos AS target
USING (VALUES
    (@ModuloUsuarios, 'usuarios.empleado.editar', N'Editar datos de empleados', CAST(0 AS bit)),
    (@ModuloUsuarios, 'usuarios.cuenta.editar', N'Editar cuentas de usuario', CAST(1 AS bit))
) AS source (IdModulo, Codigo, Nombre, EsCritico)
ON target.Codigo = source.Codigo
WHEN MATCHED THEN
    UPDATE SET Id_Modulo = source.IdModulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN
    INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.IdModulo, source.Codigo, source.Nombre, source.EsCritico, 1);

INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND p.Codigo IN ('usuarios.empleado.editar', 'usuarios.cuenta.editar')
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.Seg_PermisosXRol rp
      WHERE rp.Id_Rol_Usuario = r.Id_Rol_Usuario
        AND rp.Id_Permiso = p.Id_Permiso
  );

COMMIT TRANSACTION;
