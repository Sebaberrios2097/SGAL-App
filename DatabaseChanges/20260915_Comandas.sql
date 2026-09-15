/* ============================================================================
   Comandas en la sección de Ventas
   ----------------------------------------------------------------------------
   - Estado de comanda (preparación) por venta: columna Fecha_Comanda_Terminada
     en Ven_Ventas (NULL = comanda pendiente; con fecha = terminada).
   - Permiso nuevo en el módulo Ventas: ventas.comandas.gestionar (ver la vista
     de Comandas y marcar/reabrir comandas).
   Idempotente: puede ejecutarse varias veces sin duplicar datos.
   ============================================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Estado de la comanda dentro de la venta.
IF COL_LENGTH('dbo.Ven_Ventas', 'Fecha_Comanda_Terminada') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Fecha_Comanda_Terminada DATETIME NULL;

-- 2) Permiso nuevo en el módulo Ventas.
MERGE dbo.Seg_Permisos AS target
USING (
    SELECT m.Id_Modulo,
           'ventas.comandas.gestionar' AS Codigo,
           N'Gestionar comandas' AS Nombre,
           CAST(0 AS BIT) AS EsCritico
    FROM dbo.Seg_Modulos m
    WHERE m.Codigo = 'ventas'
) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.EsCritico, 1);

-- 3) El rol Administrador conserva todos los permisos: le otorgamos el nuevo.
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND p.Codigo = 'ventas.comandas.gestionar'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Seg_PermisosXRol x
      WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

COMMIT;
PRINT 'Comandas: columna de estado y permiso ventas.comandas.gestionar aplicados.';
