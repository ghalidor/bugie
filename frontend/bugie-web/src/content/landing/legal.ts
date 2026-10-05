/* Contenido por defecto de las páginas legales. El texto real (HTML) se
   edita desde el gestor: secciones 'terms' y 'privacy'. */

export interface LegalContent {
  title: string;
  updatedLabel: string;
  updatedAt: string;
  html: string;
}

export const TERMS: LegalContent = {
  title: 'Términos y Condiciones',
  updatedLabel: 'Última actualización',
  updatedAt: '',
  html: '<p>Cargando contenido...</p>',
};

export const PRIVACY: LegalContent = {
  title: 'Política de Privacidad',
  updatedLabel: 'Última actualización',
  updatedAt: '',
  html: '<p>Cargando contenido...</p>',
};

/** Texto mientras llega el contenido desde la API. */
export const LEGAL_LOADING = 'Cargando...';
