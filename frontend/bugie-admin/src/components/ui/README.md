# Componentes UI de Bugie Admin

Importa todo desde `src/components/ui`:

```tsx
import { Page, SectionCard, DataTable, useToast, useConfirm } from '../../components/ui';
```

Estilos: `src/styles/_ui.scss`. Colores: `src/styles/_variables.scss` (único lugar del tema claro/oscuro).

## Patrón de página recomendado

```
Page (título, subtítulo de 1 línea, acciones, helpKey)
 └─ Tabs (si hay varias vistas; la pestaña vive en ?tab=)
     └─ FilterBar (buscador + chips + filtros extra)
         └─ DataTable  o  SectionCard(s)
             └─ Pagination
```

- Formularios largos: en un `Drawer`, o en la página con `SaveBar` + `useUnsavedChanges`.
- Confirmaciones: `useConfirm()`. Avisos: `useToast()`.
- **Prohibido**: `alert()`, `confirm()`, `prompt()`, overlays propios con `position: fixed` y z-index inventado.
- **Prohibido**: anchos fijos en px para controles (`width: 220`), usa `flex`/grid.
- **Prohibido**: `color + '22'` o `'var(--x)22'` (CSS inválido). Usa `StatusBadge`, las clases `bx-tone-*` o los tokens `--bugie-soft-*`.
- Colores siempre con `var(--bugie-*)`, nunca hex fijos.

## Componentes

| Componente | Props principales |
|---|---|
| `Page` | `title`, `subtitle`, `icon`, `actions: PageAction[]` (`{label, icon, onClick \| to, variant: 'primary'\|'secondary'\|'danger', loading, disabled, hidden}`), `extra`, `back: {to,label}`, `helpKey`, `noAutoTour`. En móvil solo queda visible la acción `primary`; el resto pasa al menú "⋯". |
| `SectionCard` | `title`, `description`, `icon`, `actions`, `footer`, `flush` (sin relleno, para tablas/listas), `tourId`. |
| `Masonry` | `minColumnWidth` (px, por defecto 380), `gap` (px, 16). Tarjetas de alto distinto acomodadas como rompecabezas: cada una va a la columna más corta (en orden) y la última de cada columna se estira hasta el final, sin huecos. Usar en vez de `columns:` de CSS. |
| `StatGrid` / `StatCard` | Grid `min` (px, por defecto 160). Card: `label`, `value`, `icon`, `tone`, `hint`, `trend: {value, direction: 'up'\|'down'\|'flat', good?}`, `loading`, `pulse`, `to` \| `onClick`. |
| `Tabs` | `items: {value, label, icon?, count?, disabled?}[]`. Sin `value` usa la URL (`param`, por defecto `tab`); con `value`+`onChange` es controlado. Lee la pestaña en la página con `useTabParam(values, param)`. |
| `FilterBar` | `search`, `onSearchChange`, `searchPlaceholder`, `chips`, `chip`, `onChipChange`, `children` (filtros extra; en móvil van a un Drawer "Filtros"), `activeCount`, `onClear`, `actions`. Para no llamar a la API en cada tecla: `useDebouncedValue(search)`. |
| `Pagination` | `page` (desde 1), `pageSize`, `total`, `onPageChange`, `onPageSizeChange?`, `pageSizeOptions?`. |
| `DataTable<T>` | `columns: Column<T>[]` (`key`, `header`, `render?`, `priority: 1\|2\|3`, `align`, `width?` en %, `mobileLabel?`), `rows`, `rowKey`, `loading`, `empty` (props de EmptyState o nodo), `onRowClick`, `actions(row) => ActionItem[]`, `inlineActions`, `mobileTitle`, `mobileSubtitle`, `maxHeight`. Prioridad 1 = siempre visible y sale en la tarjeta móvil (máx. 3); 2 = desde 992px; 3 = desde 1200px. |
| `ActionMenu` | Menú "⋯": `items: ActionItem[]` (`{label, icon, onClick \| to, danger, disabled, separator, hidden}`), `label`, `trigger`, `align`. |
| `Modal` / `Drawer` | `open`, `onClose`, `title`, `description`, `footer`, `size: 'sm'\|'md'\|'lg'\|'xl'`, `dirty` (`true` o `'auto'`: detecta solo si el usuario escribió), `busy` (envío en curso), `hideClose` (solo confirmaciones). La X, Esc y el clic fuera cierran igual; si hay cambios sin guardar o un envío en curso, piden confirmación antes. Si tu `onClose` ya pregunta (hook `useConfirm`), no pases `dirty`. El foco queda atrapado. Drawer a la derecha y a pantalla completa en móvil. |
| `Select` | `value`, `onChange(value)`, `options: {value, label, icon?, hint?, disabled?}[]`, `placeholder`, `disabled`, `error`, `size: 'sm'\|'md'`, `width: 'full'\|'auto'`, `searchable` (por defecto con más de 8 opciones), `aria-label`. Reemplaza a `<select>`: lista en portal, teclado (flechas, Enter, Esc, letra inicial) y accesible. Dentro de `Field` recibe id/aria solo. **Prohibido** usar `<select>` nativo. |
| `useConfirm()` | `const r = await confirm({title, message, tone: 'primary'\|'danger'\|'warning', confirmText, reason: 'optional'\|'required', reasonLabel, reasonDefault, reasonMinLength, reasonMaxLength, typeToConfirm: 'ELIMINAR'})`. Devuelve `null` si cancela o `{reason}` si confirma. `typeToConfirm` = acciones irreversibles. |
| `useToast()` | `toast.success(msg, title?)`, `.error()`, `.info()`, `.warning()`, `.show({tone, title, message, duration})`. |
| `StatusBadge` | `tone: 'primary'\|'ok'\|'warn'\|'bad'\|'info'\|'neutral'`, `icon`, `dot`, `size`. Con `statusTone('pending')` obtienes el tono de estados comunes. |
| `EmptyState` | `title`, `text`, `action`, `icon`, `compact`, `variant: 'empty'\|'done'\|'error'`. |
| `Skeleton` | `width`, `height`, `radius`, `count`. |
| `Field` | `label`, `children` (un control; recibe id/aria solo), `help` (1 línea), `helpLong` (tooltip con "?"), `error`, `required`, `optional`. |
| `Switch` | `checked`, `onChange(bool)`, `label`, `description`, `disabled`. |
| `Checkbox` | `checked`, `onChange(bool)`, `label`, `description`, `disabled`, `size: 'sm'\|'md'`, `ariaLabel`. Casilla de 20px con check animado y foco visible. **Prohibido** `<input type="checkbox">` suelto. Para sí/no de configuración usa `Switch`. |
| `FormGrid` / `FormActions` | `FormGrid cols={1\|2\|3}` (por defecto 2) y `Field span="full"`. `FormActions` = botones al final a la derecha. Ver "Formularios". |
| `Tooltip` / `IconButton` | `Tooltip content placement`. `IconButton icon label variant size` (botón de solo icono con tooltip y aria-label obligatorios). |
| `SaveBar` + `useUnsavedChanges(dirty)` | `SaveBar dirty onSave onDiscard saving`. El hook avisa al cerrar la pestaña y al hacer clic en enlaces internos; devuelve `confirmLeave()` para navegar por código. No intercepta el botón "Atrás" del navegador. |
| Tour | Pasos en `src/tours/<clave>.json` → `{ "steps": [{ "selector": "[data-tour='x']", "title": "…", "text": "…" }] }`. Usa `<Page helpKey="clave">`: muestra "?" y se lanza solo la primera vez. Los pasos cuyo elemento no está en pantalla (otra pestaña, acción oculta por permisos) se saltan solos. Marca elementos con `data-tour` (o `tourId` en SectionCard/StatGrid). Manual: `useTour().start('clave')`. |
| Hooks | `useMediaQuery`, `useIsMobile` (< 768px), `useDebouncedValue`, `usePrefersReducedMotion`, `storage` (localStorage seguro). |

## Formularios

Todos los formularios (páginas, `Drawer`, `Modal`) siguen la misma grilla para que queden alineados "como rompecabezas":

```tsx
<form className="bx-form" onSubmit={save}>
  <FormGrid>                                   {/* 1 col en móvil, 2 cuando hay espacio (≥ ~25rem) */}
    <Field label="Nombre" required><input className="form-control" /></Field>
    <Field label="Tipo"><Select … /></Field>
    <Field label="Descripción" span="full"><textarea className="form-control" /></Field>
    <Field label="Días" help="Entre 1 y 30.">
      <div className="input-group bx-num">…</div>   {/* número corto: angosto pero alineado */}
    </Field>
  </FormGrid>
  <FormActions><button className="btn btn-bugie">Guardar</button></FormActions>
</form>
```

Reglas:
- Usa `FormGrid` (o `.bx-form-grid`), nunca `row/col-*` ni `repeat(auto-fit, …)` propios: con auto-fit salen 3 columnas en un lado y 1 huérfana en otro.
- Campos largos (textarea, direcciones, listas de opciones) con `span="full"` / `.bx-col-full`.
- Todo va alineado arriba: la ayuda (`help`) o el error de un campo no desplazan a sus vecinos. Etiquetas de una línea.
- Inputs, `Select` e `input-group` miden lo mismo dentro de `Field` (`--bx-control-h`, 2.5rem), aunque uses `-sm`.
- Input + botón en una fila (p. ej. "Agregar"): `<div className="bx-input-row">input … <button/></div>`.
- Opciones sí/no dentro de la grilla: `Switch`/`Checkbox` en un `div.bx-col-full` o una lista `.bx-option-list`.
- Botones del formulario: en el `footer` del Drawer/Modal o en `FormActions` (a la derecha; en móvil a lo ancho).

## Ejemplo

```tsx
const [tab, setTab] = useTabParam(['todos', 'pendientes']);
const toast = useToast();
const confirm = useConfirm();

<Page title="Conductores" subtitle="Revisa y gestiona a los conductores." helpKey="drivers"
      actions={[{ label: 'Nuevo', icon: 'fa-plus', variant: 'primary', onClick: abrir }]}>
  <Tabs items={[{ value: 'todos', label: 'Todos' }, { value: 'pendientes', label: 'Pendientes', count: 3 }]} />
  <SectionCard flush>
    <div className="p-3"><FilterBar search={q} onSearchChange={setQ} /></div>
    <DataTable columns={cols} rows={rows} rowKey={r => r.id} loading={loading}
      actions={r => [{ label: 'Suspender', icon: 'fa-ban', danger: true, onClick: async () => {
        const res = await confirm({ title: '¿Suspender?', tone: 'danger', reason: 'required' });
        if (res) { await suspender(r.id, res.reason); toast.success('Conductor suspendido'); }
      } }]} />
    <div className="px-3"><Pagination page={page} pageSize={20} total={total} onPageChange={setPage} /></div>
  </SectionCard>
</Page>
```

## Centro de avisos y permisos de ruta

- `NotificationCenter` (src/components, montado en `AdminShell`): avisos arriba a la derecha. Llegan por SignalR (`admin:event` y `deviation:new`, ver `useMonitorHub`) y como recordatorios periódicos (`GET /api/trips/admin/notifications/summary`). La configuración (activo, color, duración, periodicidad) está en `src/state/adminNotify.ts` y se edita en Sistema > Avisos. Desde el backend se emite un aviso con `POST /api/internal/admin-events` en Trips (`X-Internal-Token`): `{ type, title, message, link, permission }`.
- `RouteGuard` (en `AdminShell`): cada ruta exige el permiso de su ítem en `navConfig.ts`. Para una página nueva basta con agregarla a `navConfig.ts` con su permiso (y el permiso en `PERMS` y en `Permissions.cs` de Auth).
