/* Contenido de /seguridad. Sección del gestor: 'safety'. */

export const SAFETY = {
  eyebrow: 'Seguridad',
  title: 'La seguridad de Bugie no es un feature — es la razón por la que existe.',
  subtitle: 'Verificación física, monitoreo continuo y respuesta coordinada.',
  mapLabel: 'Zonas de operación verificada en {city}',
  features: [
    { icon: 'fa-id-card',              title: 'Verificación presencial',         text: 'DNI, licencia, SOAT y antecedentes penales.' },
    { icon: 'fa-camera',               title: 'Selfie al conectarse',            text: 'El conductor se toma una foto cada vez que se conecta y queda registrada.' },
    { icon: 'fa-location-dot',         title: 'Monitoreo 24/7',                  text: 'Rutas registradas en tiempo real.' },
    { icon: 'fa-triangle-exclamation', title: 'Botón SOS',                       text: 'La alerta llega al centro de monitoreo y a los administradores, y se avisa por correo a tu contacto de emergencia.' },
    { icon: 'fa-shield-halved',        title: 'Respuesta en menos de 2 minutos', text: 'Objetivo operativo de Bugie.' },
    { icon: 'fa-book',                 title: 'Libro de Reclamaciones',          text: 'Registra tu reclamo en línea y consulta su estado con tu código.' },
  ],
  stats: [
    { value: '5,000+', label: 'Conductores verificados' },
    { value: '24/7',   label: 'Monitoreo activo' },
    { value: '<2min',  label: 'Respuesta SOS' },
    { value: '100%',   label: 'Verificación presencial' },
  ],
};
