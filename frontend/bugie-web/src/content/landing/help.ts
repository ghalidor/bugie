/* Botón flotante de ayuda (HelpFab) en las páginas públicas.
   El número sale de support_phone (GET /landing/settings).
   - Si es un celular peruano (9 dígitos que empiezan en 9) abre WhatsApp.
   - Si es un fijo, WhatsApp no sirve: el botón llama por teléfono.
   - Si no hay teléfono configurado, no se muestra. */

export const HELP_FAB = {
  whatsappLabel: 'Escríbenos por WhatsApp',
  whatsappMessage: 'Hola, Bugie. Tengo una consulta desde la web.',
  callLabel: 'Llama a soporte de Bugie',
  tooltip: '¿Necesitas ayuda?',
};
