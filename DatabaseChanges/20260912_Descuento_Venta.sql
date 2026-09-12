/* ============================================================================
   Descuento en la venta (al momento del cobro)
   ----------------------------------------------------------------------------
   - Permiso nuevo en el módulo Ventas: ventas.descuento.aplicar.
   - Límite de % por rol: columna Valor_Limite en Seg_PermisosXRol (parametriza el
     permiso; para el descuento es el porcentaje máximo que ese rol puede aplicar).
   - Registro en la venta: Porcentaje_Descuento y Monto_Descuento en Ven_Ventas
     (Monto_Total queda ya con el descuento aplicado).
   ============================================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Límite numérico por permiso/rol (NULL = sin límite explícito).
IF COL_LENGTH('dbo.Seg_PermisosXRol', 'Valor_Limite') IS NULL
    ALTER TABLE dbo.Seg_PermisosXRol ADD Valor_Limite DECIMAL(5,2) NULL;

-- 2) Registro del descuento en la venta.
IF COL_LENGTH('dbo.Ven_Ventas', 'Porcentaje_Descuento') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Porcentaje_Descuento DECIMAL(5,2) NOT NULL
        CONSTRAINT DF_Ven_Ventas_Porcentaje_Descuento DEFAULT (0);
IF COL_LENGTH('dbo.Ven_Ventas', 'Monto_Descuento') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Monto_Descuento INT NOT NULL
        CONSTRAINT DF_Ven_Ventas_Monto_Descuento DEFAULT (0);

-- 3) Permiso nuevo en el módulo Ventas (Id_Modulo = 13).
MERGE dbo.Seg_Permisos AS target
USING (SELECT
        (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas') AS Id_Modulo,
        'ventas.descuento.aplicar' AS Codigo,
        'Aplicar descuento en venta' AS Nombre,
        CAST(1 AS BIT) AS EsCritico) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.EsCritico, 1);

-- 4) Concede el permiso al rol Administrador con un límite del 100% por defecto.
-- Se ejecuta con EXEC para que compile ya con la columna Valor_Limite creada en este mismo script.
EXEC(N'
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion, Valor_Limite)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE(), 100
FROM dbo.Emp_Roles_Usuarios r
CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = ''ADMINISTRADOR''
  AND p.Codigo = ''ventas.descuento.aplicar''
  AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
      WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);');

COMMIT;
PRINT 'Descuento en venta: columnas, permiso y límite por rol aplicados.';
