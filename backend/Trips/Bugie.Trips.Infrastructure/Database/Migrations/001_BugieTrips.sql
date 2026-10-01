-- ============================================================
-- BugieTrips — Viajes, rutas y emergencias
-- ============================================================
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BugieTrips')
    CREATE DATABASE BugieTrips;
GO
USE BugieTrips;
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'trips')
    EXEC('CREATE SCHEMA trips');
GO

-- Viajes
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('trips.Trips'))
BEGIN
    CREATE TABLE trips.Trips (
        Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        PassengerId     UNIQUEIDENTIFIER NOT NULL,
        DriverId        UNIQUEIDENTIFIER NULL,
        VehicleId       UNIQUEIDENTIFIER NULL,   -- vehículo asignado
        OriginAddress   NVARCHAR(300)    NOT NULL,
        OriginLat       FLOAT            NOT NULL,
        OriginLng       FLOAT            NOT NULL,
        DestAddress     NVARCHAR(300)    NOT NULL,
        DestLat         FLOAT            NOT NULL,
        DestLng         FLOAT            NOT NULL,
        DistanceKm      FLOAT            NULL,   -- distancia calculada
        EstimatedFare   DECIMAL(10,2)    NOT NULL,
        FinalFare       DECIMAL(10,2)    NULL,
        PaymentMethod   NVARCHAR(10)     NOT NULL,  -- cash | yape | plin
        Status          SMALLINT         NOT NULL DEFAULT 1,
        -- 1=Pending 2=Accepted 3=InProgress 4=Completed 5=Cancelled 6=SosActive
        CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        AcceptedAt      DATETIME2        NULL,
        DriverArrivedAt DATETIME2        NULL,   -- cuando el conductor llega al origen
        StartedAt       DATETIME2        NULL,
        CompletedAt     DATETIME2        NULL,
        CancelledBy     NVARCHAR(20)     NULL,   -- passenger | driver | system
        CancelReason    NVARCHAR(200)    NULL,
        CONSTRAINT PK_Trips        PRIMARY KEY (Id),
        CONSTRAINT CK_Trips_Pay    CHECK (PaymentMethod IN ('cash','yape','plin')),
        CONSTRAINT CK_Trips_Status CHECK (Status BETWEEN 1 AND 6)
    );
    CREATE INDEX IX_Trips_Passenger ON trips.Trips (PassengerId);
    CREATE INDEX IX_Trips_Driver    ON trips.Trips (DriverId);
    CREATE INDEX IX_Trips_Status    ON trips.Trips (Status);
    CREATE INDEX IX_Trips_Created   ON trips.Trips (CreatedAt DESC);
    PRINT 'trips.Trips OK';
END
GO

-- Puntos de ruta del viaje (para mostrar el recorrido real al pasajero)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('trips.TripRoutePoints'))
BEGIN
    CREATE TABLE trips.TripRoutePoints (
        Id         BIGINT           NOT NULL IDENTITY(1,1),
        TripId     UNIQUEIDENTIFIER NOT NULL,
        Lat        FLOAT            NOT NULL,
        Lng        FLOAT            NOT NULL,
        SpeedKmh   FLOAT            NULL,
        RecordedAt DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_RoutePoints PRIMARY KEY (Id),
        CONSTRAINT FK_Route_Trip  FOREIGN KEY (TripId) REFERENCES trips.Trips(Id)
    );
    CREATE INDEX IX_Route_Trip ON trips.TripRoutePoints (TripId, RecordedAt);
    PRINT 'trips.TripRoutePoints OK';
END
GO

-- Alertas SOS
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('trips.SosAlerts'))
BEGIN
    CREATE TABLE trips.SosAlerts (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        TripId      UNIQUEIDENTIFIER NOT NULL,
        UserId      UNIQUEIDENTIFIER NOT NULL,
        UserRole    NVARCHAR(20)     NOT NULL,
        Lat         FLOAT            NOT NULL,
        Lng         FLOAT            NOT NULL,
        Resolved    BIT              NOT NULL DEFAULT 0,
        ResolvedBy  UNIQUEIDENTIFIER NULL,
        CreatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        ResolvedAt  DATETIME2        NULL,
        CONSTRAINT PK_SosAlerts PRIMARY KEY (Id),
        CONSTRAINT FK_Sos_Trip  FOREIGN KEY (TripId) REFERENCES trips.Trips(Id)
    );
    CREATE INDEX IX_Sos_Active ON trips.SosAlerts (Resolved, CreatedAt);
    PRINT 'trips.SosAlerts OK';
END
GO
PRINT '✓ BugieTrips lista';
GO
