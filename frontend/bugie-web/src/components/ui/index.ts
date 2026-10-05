// Componentes compartidos de la web con sesion (pasajero y conductor).
// Adaptados del kit del panel admin (frontend/bugie-admin/src/components/ui).
// Importa siempre desde aqui:
//   import { Page, SectionCard, StatGrid, StatCard, useToast } from '../../components/ui';
// Estilos: src/styles/app.scss (prefijo "bx-").
//
// Reglas:
//  - Nada de alert()/confirm()/prompt(): usa useConfirm() y useToast().
//  - Nada de overlays propios con position: fixed: usa Modal / Drawer.
//  - Nada de colores concatenados (color + '22'): usa StatusBadge, Notice o las clases bx-tone-*.
//  - Nada de anchos fijos en px para controles.
//  - Formularios: <form className="bx-form"> + <FormGrid> (1 col en movil, 2 cuando hay espacio)
//    con <Field> (span="full" para textarea/direcciones) y <FormActions> para los botones (a la derecha).
//    Todo alineado arriba: la ayuda de un campo no desalinea a sus vecinos. Nada de row/col-* en formularios.
//    Si una fila queda con un solo campo, que ocupe todo el ancho (span="full").
//  - Casillas: <Checkbox checked onChange label /> (nunca <input type="checkbox"> suelto).
export * from './hooks';
export * from './Basics';
export * from './Modal';
export * from './ConfirmDialog';
export * from './Toast';
export * from './Pagination';
export * from './Tabs';
export * from './Forms';
export * from './Select';
export * from './Page';
export * from './CountUp';
export * from './HoldButton';
export * from './Motion';
