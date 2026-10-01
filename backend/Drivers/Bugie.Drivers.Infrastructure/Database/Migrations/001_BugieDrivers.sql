-- ============================================================
-- BugieDrivers — Todo lo relacionado al conductor
-- ============================================================
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BugieDrivers')
    CREATE DATABASE BugieDrivers;
GO
USE BugieDrivers;
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'drivers')
    EXEC('CREATE SCHEMA drivers');
GO

-- Perfil del conductor
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('drivers.Drivers'))
BEGIN
    CREATE TABLE drivers.Drivers (
        Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        UserId          UNIQUEIDENTIFIER NOT NULL,
        Status          SMALLINT         NOT NULL DEFAULT 1,
        -- 1=PendingDocs 2=UnderReview 3=Approved 4=Suspended 5=Rejected
        IsOnline        BIT              NOT NULL DEFAULT 0,
        -- Ubicación actual con tipo geográfico para índice espacial
        CurrentLocation GEOGRAPHY        NULL,
        CurrentLat      FLOAT            NULL,  -- redundante para lectura rápida
        CurrentLng      FLOAT            NULL,
        FaceIdPhotoUrl  NVARCHAR(500)    NULL,
        Rating          DECIMAL(3,2)     NOT NULL DEFAULT 5.00,
        TotalRatings    INT              NOT NULL DEFAULT 0,
        CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        ApprovedAt      DATETIME2        NULL,
        CONSTRAINT PK_Drivers       PRIMARY KEY (Id),
        CONSTRAINT UQ_Driver_User   UNIQUE      (UserId),
        CONSTRAINT CK_Driver_Status CHECK       (Status BETWEEN 1 AND 5)
    );
    -- Índice espacial para búsqueda de conductores cercanos
    CREATE SPATIAL INDEX SIX_Drivers_Location
        ON drivers.Drivers (CurrentLocation)
        USING GEOGRAPHY_GRID
        WITH (GRIDS = (MEDIUM, MEDIUM, MEDIUM, MEDIUM), CELLS_PER_OBJECT = 16);

    CREATE INDEX IX_Drivers_Status   ON drivers.Drivers (Status);
    CREATE INDEX IX_Drivers_Online   ON drivers.Drivers (IsOnline) WHERE IsOnline = 1;
    PRINT 'drivers.Drivers OK';
END
GO

-- Vehículos del conductor (un conductor puede tener varios)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('drivers.Vehicles'))
BEGIN
    CREATE TABLE drivers.Vehicles (
        Id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        DriverId     UNIQUEIDENTIFIER NOT NULL,
        Plate        NVARCHAR(20)     NOT NULL,
        Brand        NVARCHAR(60)     NOT NULL,  -- Toyota
        Model        NVARCHAR(60)     NOT NULL,  -- Yaris
        Year         SMALLINT         NOT NULL,
        Color        NVARCHAR(30)     NOT NULL,
        IsActive     BIT              NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Vehicles      PRIMARY KEY (Id),
        CONSTRAINT UQ_Vehicle_Plate UNIQUE      (Plate),
        CONSTRAINT FK_Vehicle_Driver FOREIGN KEY (DriverId) REFERENCES drivers.Drivers(Id)
    );
    CREATE INDEX IX_Vehicles_Driver ON drivers.Vehicles (DriverId);
    PRINT 'drivers.Vehicles OK';
END
GO

-- Documentos del conductor
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('drivers.Documents'))
BEGIN
    CREATE TABLE drivers.Documents (
        Id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        DriverId     UNIQUEIDENTIFIER NOT NULL,
        DocType      NVARCHAR(30)     NOT NULL,
        -- dni | license | soat | background_check | vehicle_tech
        FileUrl      NVARCHAR(500)    NOT NULL,
        Status       NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        -- pending | approved | rejected
        ExpiresAt    DATETIME2        NULL,
        ReviewedAt   DATETIME2        NULL,
        ReviewedBy   UNIQUEIDENTIFIER NULL,  -- UserId del admin
        CreatedAt    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Documents       PRIMARY KEY (Id),
        CONSTRAINT FK_Doc_Driver      FOREIGN KEY (DriverId) REFERENCES drivers.Drivers(Id),
        CONSTRAINT CK_Doc_Type        CHECK       (DocType IN ('dni','license','soat','background_check','vehicle_tech')),
        CONSTRAINT CK_Doc_Status      CHECK       (Status IN ('pending','approved','rejected'))
    );
    CREATE INDEX IX_Docs_Driver ON drivers.Documents (DriverId);
    PRINT 'drivers.Documents OK';
END
GO

-- Historial de ubicación (tracking en tiempo real)
-- Se inserta cada 5-10 segundos cuando el conductor está online
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('drivers.LocationHistory'))
BEGIN
    CREATE TABLE drivers.LocationHistory (
        Id        BIGINT           NOT NULL IDENTITY(1,1),
        DriverId  UNIQUEIDENTIFIER NOT NULL,
        TripId    UNIQUEIDENTIFIER NULL,   -- NULL si no está en viaje
        Lat       FLOAT            NOT NULL,
        Lng       FLOAT            NOT NULL,
        SpeedKmh  FLOAT            NULL,
        Heading   FLOAT            NULL,   -- dirección en grados 0-360
        RecordedAt DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_LocHist PRIMARY KEY (Id)
    );
    -- Particionado por fecha para rendimiento con alto volumen
    CREATE INDEX IX_LocHist_Driver_Time ON drivers.LocationHistory (DriverId, RecordedAt DESC);
    CREATE INDEX IX_LocHist_Trip        ON drivers.LocationHistory (TripId) WHERE TripId IS NOT NULL;
    PRINT 'drivers.LocationHistory OK';
END
GO

-- Calificaciones de conductores
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('drivers.Reviews'))
BEGIN
    CREATE TABLE drivers.Reviews (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        DriverId    UNIQUEIDENTIFIER NOT NULL,
        PassengerId UNIQUEIDENTIFIER NOT NULL,
        TripId      UNIQUEIDENTIFIER NOT NULL,
        Rating      TINYINT          NOT NULL,  -- 1 a 5
        Comment     NVARCHAR(500)    NULL,
        CreatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Reviews      PRIMARY KEY (Id),
        CONSTRAINT FK_Rev_Driver   FOREIGN KEY (DriverId) REFERENCES drivers.Drivers(Id),
        CONSTRAINT UQ_Rev_Trip     UNIQUE (TripId),  -- una calificación por viaje
        CONSTRAINT CK_Rev_Rating   CHECK (Rating BETWEEN 1 AND 5)
    );
    CREATE INDEX IX_Reviews_Driver ON drivers.Reviews (DriverId);
    PRINT 'drivers.Reviews OK';
END
GO
PRINT '✓ BugieDrivers lista';
GO

-- ── Trigger: garantiza que solo un vehículo esté activo por conductor ────
-- Esto protege la regla incluso si se hace una actualización directa en BD.
GO
IF OBJECT_ID('drivers.TR_Vehicles_OneActivePerDriver', 'TR') IS NOT NULL
    DROP TRIGGER drivers.TR_Vehicles_OneActivePerDriver;
GO

CREATE TRIGGER drivers.TR_Vehicles_OneActivePerDriver
ON drivers.Vehicles
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Si se activó un vehículo, desactivar todos los demás del mismo conductor
    IF EXISTS (SELECT 1 FROM inserted WHERE IsActive = 1)
    BEGIN
        UPDATE drivers.Vehicles
        SET IsActive = 0
        WHERE DriverId IN (SELECT DriverId FROM inserted WHERE IsActive = 1)
          AND Id NOT IN (SELECT Id FROM inserted WHERE IsActive = 1)
          AND IsActive = 1;
    END
END;
GO
PRINT 'Trigger OneActivePerDriver OK';
GO
