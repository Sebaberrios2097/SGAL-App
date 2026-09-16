SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- La tabla de "Empleados" ahora también aloja a "Externos": personas o empresas
-- que no son empleados de la organización pero acceden al sistema con sus roles.
--   Es_Externo      : 0 = empleado, 1 = externo.
--   Tipo_Documento  : 'RUN' persona natural, 'RUT' empresa.
-- El RUT/RUN sigue siendo obligatorio y único (activo) para todos.
-- ---------------------------------------------------------------------------

IF COL_LENGTH('dbo.Emp_Empleados', 'Es_Externo') IS NULL
    ALTER TABLE dbo.Emp_Empleados ADD Es_Externo BIT NOT NULL CONSTRAINT DF_Emp_Empleados_Es_Externo DEFAULT 0;

IF COL_LENGTH('dbo.Emp_Empleados', 'Tipo_Documento') IS NULL
    ALTER TABLE dbo.Emp_Empleados ADD Tipo_Documento CHAR(3) NOT NULL CONSTRAINT DF_Emp_Empleados_Tipo_Documento DEFAULT 'RUN';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Emp_Empleados_Tipo_Documento')
    ALTER TABLE dbo.Emp_Empleados WITH CHECK
        ADD CONSTRAINT CK_Emp_Empleados_Tipo_Documento CHECK (Tipo_Documento IN ('RUN', 'RUT'));

COMMIT TRANSACTION;
