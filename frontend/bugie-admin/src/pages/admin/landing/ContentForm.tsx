import { useState } from 'react';
import { fieldMeta, itemTitle } from './meta';

/* ──────────────────────────────────────────────────────────────────────────
   Formulario de contenido.

   Lo que estaba mal antes, y qué se hizo:

   · Todo tenía el mismo tono. El borde del bloque, el del elemento y el del
     campo eran el mismo gris, y el fondo del input casi igual al de la
     tarjeta: el ojo no encontraba dónde empezaba una cosa y terminaba otra.
     Ahora el input usa el fondo de la página (--bugie-bg) dentro de una
     tarjeta que usa el de superficie, así se lee como un hueco donde escribir.

   · Había cuatro niveles de caja anidada. Ahora los bloques no llevan marco:
     se separan con un título y una línea. Solo los elementos de una lista
     llevan recuadro, porque son cosas que se abren y se cierran.

   · Las ayudas y los contadores estaban siempre, en gris, debajo de cada
     campo. Ahora la ayuda sale solo si aporta, y el contador solo cuando te
     acercas al límite.
   ────────────────────────────────────────────────────────────────────────── */

type Json = any;

const clone = (v: Json) => JSON.parse(JSON.stringify(v));

function getIn(obj: Json, path: (string | number)[]): Json {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k as any]), obj);
}

function setIn(obj: Json, path: (string | number)[], val: Json): Json {
  const next = clone(obj);
  let cur = next;
  path.slice(0, -1).forEach(k => { cur = cur[k as any]; });
  cur[path[path.length - 1] as any] = val;
  return next;
}

function blankLike(sample: Json): Json {
  if (sample == null) return '';
  if (typeof sample === 'object' && !Array.isArray(sample)) {
    return Object.fromEntries(Object.keys(sample).map(k => [k, '']));
  }
  return '';
}

/** Campos cortos: no necesitan media pantalla. */
const NARROW = new Set(['value', 'suffix', 'stars', 'icon', 'iconClass', 'href', 'url',
                        'external', 'city', 'phone', 'email']);

/** Ayudas que describen la sección y sobran dentro de cada tarjeta. */
const GENERIC_IN_LIST = new Set(['title', 'subtitle', 'text', 'description', 'label']);

const STYLES = `
.lf-block { margin-bottom: 1.6rem; }
.lf-block:last-child { margin-bottom: 0; }
.lf-head {
  display: flex; align-items: center; gap: .5rem;
  padding-bottom: .5rem; margin-bottom: 1rem;
  border-bottom: 1px solid var(--bugie-border);
}
.lf-head i { opacity: .55; font-size: .8rem; }
.lf-title { font-weight: 700; font-size: .95rem; letter-spacing: -.01em; }
.lf-count { font-size: .75rem; color: var(--bugie-muted); }
.lf-note { font-size: .78rem; color: var(--bugie-muted); margin: -.55rem 0 .9rem; }

.lf-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1.15rem; }
.lf-col-12 { grid-column: span 12; }
.lf-col-6  { grid-column: span 6; }
.lf-col-4  { grid-column: span 4; }
@media (max-width: 991px) { .lf-col-6, .lf-col-4 { grid-column: span 12; } }

.lf-label {
  display: flex; align-items: center; gap: .45rem;
  font-size: .82rem; font-weight: 600; margin-bottom: .35rem; color: var(--bugie-text);
}
.lf-input {
  width: 100%; color: var(--bugie-text);
  background: var(--bugie-bg);
  border: 1px solid var(--bugie-border); border-radius: 9px;
  padding: .55rem .7rem; font-size: .9rem; line-height: 1.45;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.lf-input::placeholder { color: var(--bugie-muted); }
.lf-input:focus {
  outline: none; border-color: var(--bugie-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bugie-primary) 22%, transparent);
}
textarea.lf-input { resize: vertical; min-height: 78px; }

.lf-foot { display: flex; justify-content: space-between; gap: .75rem; margin-top: .3rem; }
.lf-help { font-size: .74rem; color: var(--bugie-muted); }
.lf-counter { font-size: .74rem; color: var(--bugie-muted); white-space: nowrap; }
.lf-counter.over { color: #f87171; font-weight: 600; }

.lf-ref {
  display: flex; align-items: flex-start; gap: .5rem; margin-top: .4rem;
  padding: .4rem .55rem; border-radius: 8px;
  background: color-mix(in srgb, var(--bugie-primary) 9%, transparent);
  font-size: .76rem; color: var(--bugie-muted);
}

.lf-tag {
  font-size: .64rem; font-weight: 700; padding: .1rem .45rem; border-radius: 999px;
  background: color-mix(in srgb, #f59e0b 20%, transparent); color: #f59e0b;
}

.lf-item {
  border: 1px solid var(--bugie-border); border-radius: 10px;
  background: var(--bugie-bg); margin-bottom: .5rem; overflow: hidden;
}
.lf-item.open {
  background: var(--bugie-surface);
  border-color: color-mix(in srgb, var(--bugie-primary) 55%, var(--bugie-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bugie-primary) 12%, transparent);
}
.lf-item-head {
  display: flex; align-items: center; gap: .55rem; width: 100%;
  padding: .6rem .7rem; background: none; border: 0; color: inherit; text-align: left;
}
.lf-item-head .chev { font-size: .7rem; opacity: .5; width: 11px; }
.lf-item-head .num  { font-size: .75rem; color: var(--bugie-muted); width: 16px; }
.lf-item-head .name {
  font-size: .86rem; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lf-item-body { padding: .9rem .85rem 1rem; border-top: 1px solid var(--bugie-border); }

.lf-row { display: flex; align-items: center; gap: .5rem; }
.lf-btn {
  width: 27px; height: 27px; flex: 0 0 27px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--bugie-border); background: var(--bugie-surface);
  color: var(--bugie-muted); font-size: .7rem; padding: 0;
}
.lf-btn:hover:not(:disabled) { border-color: var(--bugie-primary); color: var(--bugie-primary); }
.lf-btn:disabled { opacity: .35; }
.lf-add {
  border: 1px dashed var(--bugie-border); background: none; color: var(--bugie-muted);
  border-radius: 9px; padding: .45rem .9rem; font-size: .8rem; font-weight: 600; width: 100%;
}
.lf-add:hover { border-color: var(--bugie-primary); color: var(--bugie-primary); }
.lf-empty { font-size: .82rem; color: var(--bugie-muted); }
`;

interface Props {
  value:        Json;
  onChange:     (next: Json) => void;
  reference?:   Json;
  translating?: boolean;
  search?:      string;
}

export default function ContentForm({ value, onChange, reference, translating, search }: Props) {
  const entries = Object.entries(value ?? {});
  const simple  = entries.filter(([, v]) => v === null || typeof v !== 'object');
  const objects = entries.filter(([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v));
  const lists   = entries.filter(([, v]) => Array.isArray(v));

  const q = (search ?? '').trim().toLowerCase();
  const hit = (key: string) =>
    !q || key.toLowerCase().includes(q) || fieldMeta(key).label.toLowerCase().includes(q);

  const vSimple = simple.filter(([k]) => hit(k));
  const vLists  = lists.filter(([k]) => hit(k));
  const vObjs   = objects.filter(([k]) => hit(k));

  return (
    <div className="lf">
      <style>{STYLES}</style>

      {q && vSimple.length === 0 && vLists.length === 0 && vObjs.length === 0 && (
        <div className="text-center py-4 lf-empty">Ningún campo coincide con «{search}».</div>
      )}

      {vSimple.length > 0 && (
        <Block title="Textos de la sección" icon="fa-font" count={vSimple.length}>
          <div className="lf-grid">
            {vSimple.map(([key, v]) => (
              <Field key={key} name={key} value={String(v ?? '')} path={[key]} root={value}
                     onChange={onChange} translating={!!translating}
                     reference={reference ? getIn(reference, [key]) : undefined} />
            ))}
          </div>
        </Block>
      )}

      {vObjs.map(([key, v]) => (
        <Block key={key} title={fieldMeta(key).label} icon="fa-layer-group">
          <div className="lf-grid">
            {Object.entries(v as object).map(([k2, v2]) =>
              v2 === null || typeof v2 !== 'object' ? (
                <Field key={k2} name={k2} value={String(v2 ?? '')} path={[key, k2]} root={value}
                       onChange={onChange} translating={!!translating}
                       reference={reference ? getIn(reference, [key, k2]) : undefined} />
              ) : null
            )}
          </div>
        </Block>
      ))}

      {vLists.map(([key, list]) => (
        <ListBlock key={key} name={key} list={list as Json[]} path={[key]} root={value}
                   onChange={onChange} translating={!!translating}
                   reference={reference ? getIn(reference, [key]) : undefined} />
      ))}
    </div>
  );
}

function Block({ title, icon, count, children }: {
  title: string; icon: string; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="lf-block">
      <header className="lf-head">
        <i className={`fa-solid ${icon}`} />
        <span className="lf-title">{title}</span>
        {count != null && <span className="lf-count">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function Field({ name, value, path, root, onChange, reference, translating, inList }: {
  name: string; value: string; path: (string | number)[]; root: Json;
  onChange: (n: Json) => void; reference?: Json; translating: boolean; inList?: boolean;
}) {
  const base = fieldMeta(name);
  const meta = inList && GENERIC_IN_LIST.has(name) ? { ...base, help: undefined } : base;

  const long  = meta.long || value.length > 95;
  const empty = value.trim() === '';
  const id    = 'lf-' + path.join('-');

  // El contador molesta si está siempre. Aparece al acercarse al límite.
  const near = meta.max != null && value.length >= meta.max * 0.8;
  const over = meta.max != null && value.length > meta.max;

  const col = long ? 'lf-col-12' : NARROW.has(name) ? 'lf-col-4' : 'lf-col-6';

  return (
    <div className={col}>
      <label htmlFor={id} className="lf-label">
        {meta.label}
        {translating && empty && <span className="lf-tag">sin traducir</span>}
      </label>

      {long ? (
        <textarea id={id} className="lf-input" rows={3} value={value}
                  onChange={e => onChange(setIn(root, path, e.target.value))} />
      ) : (
        <input id={id} className="lf-input" value={value}
               onChange={e => onChange(setIn(root, path, e.target.value))} />
      )}

      {(meta.help || near) && (
        <div className="lf-foot">
          <span className="lf-help">{meta.help ?? ''}</span>
          {near && (
            <span className={`lf-counter${over ? ' over' : ''}`}>
              {over ? `${value.length - meta.max!} de más` : `${value.length}/${meta.max}`}
            </span>
          )}
        </div>
      )}

      {translating && typeof reference === 'string' && reference !== '' && (
        <div className="lf-ref">
          <span style={{ flex: 1 }}><strong>ES:</strong> {reference}</span>
          {empty && (
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill py-0 px-2"
                    style={{ fontSize: '.7rem', whiteSpace: 'nowrap' }}
                    onClick={() => onChange(setIn(root, path, reference))}>
              Copiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ListBlock({ name, list, path, root, onChange, reference, translating }: {
  name: string; list: Json[]; path: (string | number)[]; root: Json;
  onChange: (n: Json) => void; reference?: Json; translating: boolean;
}) {
  const meta = fieldMeta(name);
  const [open, setOpen] = useState<number | null>(null);

  const ofObjects = list.length > 0 && list[0] !== null && typeof list[0] === 'object';
  const replace = (next: Json[]) => onChange(setIn(root, path, next));

  const add = () => { replace([...list, blankLike(list[0])]); setOpen(list.length); };
  const remove = (i: number) => { replace(list.filter((_, j) => j !== i)); setOpen(null); };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    replace(next);
    setOpen(j);
  };

  return (
    <Block title={meta.label} icon="fa-list" count={list.length}>
      {meta.help && <div className="lf-note">{meta.help}</div>}

      {list.length === 0 && <div className="lf-empty mb-2">Todavía no hay elementos.</div>}

      {!ofObjects && list.map((item, i) => (
        <div key={i} className="lf-row mb-2">
          <span className="lf-count" style={{ width: 16 }}>{i + 1}</span>
          <input className="lf-input" value={String(item ?? '')}
                 onChange={e => replace(list.map((v, j) => (j === i ? e.target.value : v)))} />
          <Buttons i={i} total={list.length} onMove={move} onRemove={remove} />
        </div>
      ))}

      {ofObjects && list.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`lf-item${isOpen ? ' open' : ''}`}>
            <div className="d-flex align-items-center pe-2">
              <button type="button" className="lf-item-head flex-grow-1"
                      aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                <i className={`fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'} chev`} />
                <span className="num">{i + 1}</span>
                <span className="name">{itemTitle(item, i)}</span>
              </button>
              <Buttons i={i} total={list.length} onMove={move} onRemove={remove} />
            </div>

            {isOpen && (
              <div className="lf-item-body">
                <div className="lf-grid">
                  {Object.entries(item as object).map(([k, v]) =>
                    v === null || typeof v !== 'object' ? (
                      <Field key={k} name={k} value={String(v ?? '')} path={[...path, i, k]} root={root}
                             onChange={onChange} translating={translating} inList
                             reference={reference ? getIn(reference, [i, k]) : undefined} />
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="lf-add mt-1" onClick={add}>
        <i className="fa-solid fa-plus me-2" />Agregar
      </button>
    </Block>
  );
}

function Buttons({ i, total, onMove, onRemove }: {
  i: number; total: number; onMove: (i: number, d: number) => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="d-flex gap-1 flex-shrink-0">
      <button type="button" className="lf-btn" disabled={i === 0}
              onClick={() => onMove(i, -1)} title="Subir" aria-label="Subir">
        <i className="fa-solid fa-arrow-up" />
      </button>
      <button type="button" className="lf-btn" disabled={i === total - 1}
              onClick={() => onMove(i, 1)} title="Bajar" aria-label="Bajar">
        <i className="fa-solid fa-arrow-down" />
      </button>
      <button type="button" className="lf-btn" onClick={() => onRemove(i)}
              title="Borrar" aria-label="Borrar">
        <i className="fa-solid fa-trash" />
      </button>
    </div>
  );
}
