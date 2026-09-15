SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Los consumos del empleado pasan a ser VENTAS asociadas a la bitácora del turno
-- (por cobrar al empleado), con cortesía automática por línea.
--   Ven_Ventas.Id_Bitacora        : si != NULL, es un consumo de empleado (por cobrar).
--   Ven_Ventas.Pagado_Por_Empleado: el admin marca cuándo el empleado ya pagó.
--   Ven_Detalle_Venta.Es_Cortesia : línea (o porción) marcada como cortesía (no se cobra).
-- ---------------------------------------------------------------------------

IF COL_LENGTH('dbo.Ven_Ventas', 'Id_Bitacora') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Id_Bitacora INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ven_Ventas_Tur_Bitacora')
    ALTER TABLE dbo.Ven_Ventas WITH CHECK
        ADD CONSTRAINT FK_Ven_Ventas_Tur_Bitacora
        FOREIGN KEY (Id_Bitacora) REFERENCES dbo.Tur_Bitacora (Id_Bitacora);

IF COL_LENGTH('dbo.Ven_Ventas', 'Pagado_Por_Empleado') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Pagado_Por_Empleado BIT NOT NULL CONSTRAINT DF_Ven_Ventas_Pagado_Por_Empleado DEFAULT 0;

IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Es_Cortesia') IS NULL
    ALTER TABLE dbo.Ven_Detalle_Venta ADD Es_Cortesia BIT NOT NULL CONSTRAINT DF_Ven_Detalle_Venta_Es_Cortesia DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Permiso nuevo: marcar como pagadas las ventas de consumo del empleado.
-- ---------------------------------------------------------------------------
MERGE dbo.Seg_Permisos AS target
USING (
    SELECT m.Id_Modulo,
           'registros_turnos.consumos.pagar' AS Codigo,
           N'Marcar consumos de empleado como pagados' AS Nombre,
           CAST(0 AS bit) AS EsCritico
    FROM dbo.Seg_Modulos m
    WHERE m.Codigo = 'registros_turnos'
) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.EsCritico, 1);

INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND p.Codigo = 'registros_turnos.consumos.pagar'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Seg_PermisosXRol x
      WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

COMMIT TRANSACTION;
