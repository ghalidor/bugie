-- ============================================================================
-- Migración: 002_TripProposals.sql
-- Crea formalmente la tabla trips.TripProposals (antes existía "a mano")
-- y agrega los índices necesarios para el flujo de propuestas con histórico.
-- ============================================================================

USE BugieTrips;
GO

IF NOT EXISTS (SELECT * FROM sys.tables t
               INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'trips' AND t.name = 'TripProposals')
BEGIN
    CREATE TABLE trips.TripProposals
    (
        Id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        TripId      UNIQUEIDENTIFIER NOT NULL,
        DriverId    UNIQUEIDENTIFIER NOT NULL,
        Fare        DECIMAL(10, 2)   NOT NULL,
        Status      NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        CreatedAt   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT CK_TripProposals_Status
            CHECK (Status IN ('pending', 'accepted', 'rejected', 'superseded')),

        CONSTRAINT CK_TripProposals_Fare_Positive
            CHECK (Fare > 0)
    );

    -- Listar propuestas activas de un viaje (consulta más frecuente)
    CREATE INDEX IX_TripProposals_TripId_Status
        ON trips.TripProposals (TripId, Status)
        INCLUDE (DriverId, Fare, CreatedAt);

    -- Buscar propuesta vigente de un conductor en un viaje (usado por UPSERT)
    CREATE INDEX IX_TripProposals_TripId_DriverId_Status
        ON trips.TripProposals (TripId, DriverId, Status);

    -- Histórico ordenado por fecha (modal de "ver propuestas anteriores")
    CREATE INDEX IX_TripProposals_TripId_DriverId_CreatedAt
        ON trips.TripProposals (TripId, DriverId, CreatedAt DESC);

    PRINT 'Tabla trips.TripProposals creada correctamente.';
END
ELSE
BEGIN
    PRINT 'Tabla trips.TripProposals ya existe — solo se valida la estructura.';

    -- Verificación de columna Status: si tiene CHECK viejo sin 'superseded', recrearlo
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID('trips.TripProposals')
                 AND name = 'CK_TripProposals_Status'
                 AND definition NOT LIKE '%superseded%')
    BEGIN
        ALTER TABLE trips.TripProposals DROP CONSTRAINT CK_TripProposals_Status;
        ALTER TABLE trips.TripProposals
            ADD CONSTRAINT CK_TripProposals_Status
            CHECK (Status IN ('pending', 'accepted', 'rejected', 'superseded'));
        PRINT 'Constraint CK_TripProposals_Status actualizado para incluir superseded.';
    END
END
GO
