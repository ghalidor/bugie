USE BugieLanding;
GO

-- Mensajes de contacto enviados desde la landing
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.ContactMessages'))
BEGIN
    CREATE TABLE landing.ContactMessages (
        Id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        Name      NVARCHAR(120)    NOT NULL,
        Email     NVARCHAR(200)    NOT NULL,
        Subject   NVARCHAR(60)     NOT NULL,  -- general | alliance | support | driver
        Message   NVARCHAR(2000)   NOT NULL,
        IsRead    BIT              NOT NULL DEFAULT 0,
        CreatedAt DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_ContactMessages PRIMARY KEY (Id)
    );
    CREATE INDEX IX_Contact_Read ON landing.ContactMessages (IsRead, CreatedAt DESC);
    PRINT 'landing.ContactMessages OK';
END
GO

-- Artículos de noticias/blog
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.NewsArticles'))
BEGIN
    CREATE TABLE landing.NewsArticles (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        Slug        NVARCHAR(120)    NOT NULL,
        Tag         NVARCHAR(40)     NOT NULL,
        Title       NVARCHAR(200)    NOT NULL,
        Summary     NVARCHAR(500)    NOT NULL,
        Lang        NVARCHAR(5)      NOT NULL DEFAULT 'es',
        IsPublished BIT              NOT NULL DEFAULT 1,
        PublishedAt DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CreatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_NewsArticles PRIMARY KEY (Id),
        CONSTRAINT UQ_News_Slug_Lang UNIQUE (Slug, Lang)
    );
    CREATE INDEX IX_News_Published ON landing.NewsArticles (IsPublished, PublishedAt DESC);
    PRINT 'landing.NewsArticles OK';
END
GO

-- Configuración del sistema (comisión, tarifa base, etc.)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.SystemSettings'))
BEGIN
    CREATE TABLE landing.SystemSettings (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        SettingKey  NVARCHAR(60)     NOT NULL,
        Value       NVARCHAR(500)    NOT NULL,
        Description NVARCHAR(200)    NULL,
        UpdatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        UpdatedBy   UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_Settings    PRIMARY KEY (Id),
        CONSTRAINT UQ_Setting_Key UNIQUE (SettingKey)
    );
    PRINT 'landing.SystemSettings OK';
END
GO

-- Seed: configuración inicial
IF NOT EXISTS (SELECT 1 FROM landing.SystemSettings WHERE SettingKey = 'platform_fee_rate')
BEGIN
    INSERT INTO landing.SystemSettings (Id, SettingKey, Value, Description) VALUES
    (NEWID(), 'platform_fee_rate', '0.10',  'Comisión de la plataforma (10% por defecto)'),
    (NEWID(), 'base_fare',         '5.00',  'Tarifa base mínima en soles'),
    (NEWID(), 'fare_per_km',       '1.50',  'Tarifa por kilómetro en soles'),
    (NEWID(), 'max_radius_km',     '10',    'Radio máximo de búsqueda de conductores (km)'),
    (NEWID(), 'sos_response_min',  '2',     'Tiempo objetivo de respuesta SOS en minutos'),
    (NEWID(), 'support_email',     'soporte@bugie.pe', 'Correo de soporte'),
    (NEWID(), 'support_phone',     '(044) 123-456',    'Teléfono de soporte Trujillo');
    PRINT 'Seed SystemSettings OK';
END
GO

-- Seed: noticias iniciales
IF NOT EXISTS (SELECT 1 FROM landing.NewsArticles WHERE Slug = 'bugie-lanzamiento')
BEGIN
    INSERT INTO landing.NewsArticles (Id, Slug, Tag, Title, Summary, Lang, PublishedAt) VALUES
    (NEWID(), 'bugie-lanzamiento', 'Producto',
     'Bugie lanza su plataforma de transporte seguro en Trujillo',
     'La plataforma Bugie inicia operaciones con conductores verificados, monitoreo 24/7 y botón SOS integrado para pasajeros y conductores.',
     'es', '2026-02-09'),
    (NEWID(), 'verificacion-conductores', 'Seguridad',
     'Verificación presencial obligatoria para todos los conductores',
     'Bugie implementa un proceso de validación física de documentos: DNI, licencia, SOAT y antecedentes penales se verifican en oficinas antes de aprobar cada conductor.',
     'es', '2026-02-15'),
    (NEWID(), 'arquitectura-microservicios', 'Tecnología',
     'Arquitectura modular para soportar 5000+ conductores activos',
     'El backend de Bugie usa microservicios independientes con arquitectura cebolla, CQRS y SQL Server con índices espaciales para búsqueda de conductores en tiempo real.',
     'es', '2026-03-01'),
    (NEWID(), 'panel-admin-monitoreo', 'Producto',
     'Panel administrativo con monitoreo en tiempo real',
     'El back office de Bugie permite al equipo operativo ver conductores activos en el mapa, gestionar alertas SOS y aprobar documentos desde una sola interfaz.',
     'es', '2026-03-15');
    PRINT 'Seed NewsArticles OK';
END
GO
PRINT '✓ Contact, News y Settings listos';
GO
