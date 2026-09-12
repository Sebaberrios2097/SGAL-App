-- Nuevo permiso para el Panel de turnos (dashboard analítico de turnos).
-- Idempotente: puede ejecutarse varias veces sin duplicar datos.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Alta/actualización del permiso dentro del módulo "registros_turnos".
MERGE dbo.Seg_Permisos AS target
USING (
    SELECT m.Id_Modulo,
           'registros_turnos.dashboard.ver' AS Codigo,
           N'Ver panel de turnos' AS Nombre,
           CAST(0 AS bit) AS EsCritico
    FROM dbo.Seg_Modulos m
    WHERE m.Codigo = 'registros_turnos'
) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.EsCritico, 1);

-- 2. El rol Administrador conserva todos los permisos: le otorgamos el nuevo.
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND p.Codigo = 'registros_turnos.dashboard.ver'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Seg_PermisosXRol x
      WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

COMMIT;
