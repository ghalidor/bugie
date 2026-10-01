import { useEffect, useRef } from 'react';

interface Props {
  value: string;                         // HTML
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
}

/**
 * Editor de texto enriquecido simple, sin dependencias externas.
 * Usa contentEditable + document.execCommand (deprecated pero soportado en todos los navegadores).
 *
 * Soporta: negrita, cursiva, subrayado, encabezados H2/H3, listas, enlaces,
 * alineación y limpieza de formato.
 *
 * Limitaciones conocidas (aceptables para Términos / Privacidad):
 *   - No soporta tablas ni imágenes (no las necesitamos para legales).
 *   - El HTML resultante usa tags estándar (<h2>, <p>, <strong>, <ul>, <a>, etc.).
 */
export default function RichTextEditor({
  value, onChange, minHeight = 400, placeholder = 'Escribe aquí...',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincronizar el valor externo solo cuando cambia de verdad (evita perder el cursor)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function insertLink() {
    const url = window.prompt('URL del enlace:', 'https://');
    if (url) exec('createLink', url);
  }

  function changeBlock(tag: string) {
    exec('formatBlock', tag);
  }

  return (
    <div
      style={{
        border: '1px solid var(--bugie-border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bugie-surface)',
      }}
    >
      {/* Toolbar */}
      <div
        className="d-flex flex-wrap gap-1 p-2 border-bottom"
        style={{ borderColor: 'var(--bugie-border)', background: 'var(--bugie-surface-2)' }}
      >
        <ToolbarButton icon="fa-bold"          title="Negrita"  onClick={() => exec('bold')} />
        <ToolbarButton icon="fa-italic"        title="Cursiva"  onClick={() => exec('italic')} />
        <ToolbarButton icon="fa-underline"     title="Subrayar" onClick={() => exec('underline')} />

        <Divider />

        <ToolbarSelect
          title="Formato de bloque"
          onChange={changeBlock}
          options={[
            { value: 'p',  label: 'Párrafo' },
            { value: 'h2', label: 'Título 2' },
            { value: 'h3', label: 'Título 3' },
            { value: 'h4', label: 'Título 4' },
          ]}
        />

        <Divider />

        <ToolbarButton icon="fa-list-ul"  title="Lista"          onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon="fa-list-ol"  title="Lista numerada" onClick={() => exec('insertOrderedList')} />

        <Divider />

        <ToolbarButton icon="fa-align-left"   title="Izquierda" onClick={() => exec('justifyLeft')} />
        <ToolbarButton icon="fa-align-center" title="Centro"    onClick={() => exec('justifyCenter')} />
        <ToolbarButton icon="fa-align-right"  title="Derecha"   onClick={() => exec('justifyRight')} />

        <Divider />

        <ToolbarButton icon="fa-link"           title="Enlace"          onClick={insertLink} />
        <ToolbarButton icon="fa-unlink"         title="Quitar enlace"   onClick={() => exec('unlink')} />

        <Divider />

        <ToolbarButton icon="fa-rotate-left"    title="Deshacer" onClick={() => exec('undo')} />
        <ToolbarButton icon="fa-rotate-right"   title="Rehacer"  onClick={() => exec('redo')} />
        <ToolbarButton icon="fa-eraser"         title="Limpiar formato" onClick={() => exec('removeFormat')} />
      </div>

      {/* Área editable */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="bugie-rte-content"
        style={{
          padding: '1rem',
          minHeight,
          outline: 'none',
          color: 'var(--bugie-text)',
        }}
      />

      {/* Placeholder visual + estilos del contenido */}
      <style>{`
        .bugie-rte-content:empty::before {
          content: attr(data-placeholder);
          color: var(--bugie-muted, #888);
          pointer-events: none;
        }
        .bugie-rte-content h2 { font-size: 1.5rem; font-weight: 800; margin: 1rem 0 .5rem; }
        .bugie-rte-content h3 { font-size: 1.25rem; font-weight: 700; margin: .9rem 0 .4rem; }
        .bugie-rte-content h4 { font-size: 1.1rem; font-weight: 700; margin: .8rem 0 .3rem; }
        .bugie-rte-content p  { margin: 0 0 .75rem; line-height: 1.6; }
        .bugie-rte-content ul, .bugie-rte-content ol { margin: 0 0 .75rem 1.25rem; }
        .bugie-rte-content a  { color: #4f46e5; text-decoration: underline; }
      `}</style>
    </div>
  );
}

function ToolbarButton({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-bugie-outline"
      title={title}
      onClick={onClick}
      style={{ padding: '0.3rem 0.6rem' }}
    >
      <i className={`fa-solid ${icon}`} />
    </button>
  );
}

function ToolbarSelect({
  title, options, onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="form-select form-select-sm"
      title={title}
      defaultValue=""
      onChange={e => { if (e.target.value) { onChange(e.target.value); e.target.value = ''; } }}
      style={{ width: 'auto', minWidth: 120 }}
    >
      <option value="" disabled>Formato</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--bugie-border)', margin: '0 .25rem' }} />;
}