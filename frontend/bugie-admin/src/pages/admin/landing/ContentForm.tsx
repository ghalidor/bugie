import { useState } from 'react';
import { Field, IconButton, SectionCard } from '../../../components/ui';
import { fieldMeta, itemTitle } from './meta';

/* ──────────────────────────────────────────────────────────────────────────
   Formulario de contenido de una sección de la landing.

   Se genera a partir del propio JSON: los textos sueltos van juntos en un
   bloque, cada objeto en su bloque y cada lista como acordeón (los elementos
   se abren, se mueven y se borran). Los nombres y ayudas salen de meta.ts.

   Usa Field/SectionCard del panel; los estilos viven en ../siteAdmin.scss.
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

/** Campos cortos: ocupan un tercio de la fila en escritorio. */
const NARROW = new Set(['value', 'suffix', 'stars', 'icon', 'iconClass', 'href', 'url',
                        'external', 'city', 'phone', 'email']);

/** Ancho base de un campo en la grilla de 6 columnas: completo, mitad o tercio. */
function baseSpan(name: string, value: string): number {
  const long = fieldMeta(name).long || value.length > 95;
  return long ? 6 : NARROW.has(name) ? 2 : 3;
}

/**
 * Anchos finales (1–6) para que cada fila se complete, sin cambiar el orden:
 * si el siguiente campo no cabe en lo que queda de la fila, el último campo
 * de la fila se estira hasta el borde. Lo mismo con la última fila.
 */
export function fillSpans(fields: { name: string; value: string }[]): number[] {
  const spans = fields.map(f => baseSpan(f.name, f.value));
  let used = 0;
  let last = -1;
  spans.forEach((sp, i) => {
    if (used + sp > 6 && last >= 0) { spans[last] += 6 - used; used = 0; }
    used += sp;
    last = i;
    if (used === 6) used = 0;
  });
  if (used > 0 && last >= 0) spans[last] += 6 - used;
  return spans;
}

const scalarEntries = (obj: object) =>
  Object.entries(obj).filter(([, v]) => v === null || typeof v !== 'object') as [string, Json][];

const spansOf = (entries: [string, Json][]) => fillSpans(entries.map(([k, v]) => ({ name: k, value: String(v ?? '') })));

/** Ayudas que describen la sección y sobran dentro de cada elemento de lista. */
const GENERIC_IN_LIST = new Set(['title', 'subtitle', 'text', 'description', 'label']);

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

  if (q && vSimple.length === 0 && vLists.length === 0 && vObjs.length === 0) {
    return <p className="text-center bugie-muted py-4 mb-0">Ningún campo coincide con «{search}».</p>;
  }

  const simpleSpans = spansOf(vSimple);

  return (
    <div className="sa-form">
      {vSimple.length > 0 && (
        <SectionCard title="Textos de la sección" icon="fa-font" description={`${vSimple.length} ${vSimple.length === 1 ? 'campo' : 'campos'}`}>
          <div className="sa-grid">
            {vSimple.map(([key, v], i) => (
              <TextField key={key} name={key} value={String(v ?? '')} path={[key]} root={value} span={simpleSpans[i]}
                         onChange={onChange} translating={!!translating}
                         reference={reference ? getIn(reference, [key]) : undefined} />
            ))}
          </div>
        </SectionCard>
      )}

      {vObjs.map(([key, v]) => {
        const fields = scalarEntries(v as object);
        const spans = spansOf(fields);
        return (
          <SectionCard key={key} title={fieldMeta(key).label} icon="fa-layer-group" description={fieldMeta(key).help}>
            <div className="sa-grid">
              {fields.map(([k2, v2], i) => (
                <TextField key={k2} name={k2} value={String(v2 ?? '')} path={[key, k2]} root={value} span={spans[i]}
                           onChange={onChange} translating={!!translating}
                           reference={reference ? getIn(reference, [key, k2]) : undefined} />
              ))}
            </div>
          </SectionCard>
        );
      })}

      {vLists.map(([key, list]) => (
        <ListBlock key={key} name={key} list={list as Json[]} path={[key]} root={value}
                   onChange={onChange} translating={!!translating}
                   reference={reference ? getIn(reference, [key]) : undefined} />
      ))}
    </div>
  );
}

function TextField({ name, value, path, root, onChange, reference, translating, inList, span }: {
  name: string; value: string; path: (string | number)[]; root: Json;
  onChange: (n: Json) => void; reference?: Json; translating: boolean; inList?: boolean;
  /** Columnas (de 6) que ocupa en escritorio; lo calcula fillSpans. */
  span?: number;
}) {
  const base = fieldMeta(name);
  const meta = inList && GENERIC_IN_LIST.has(name) ? { ...base, help: undefined } : base;

  const long  = meta.long || value.length > 95;
  const empty = value.trim() === '';

  // El contador aparece solo al acercarse al largo recomendado.
  const near = meta.max != null && value.length >= meta.max * 0.8;
  const over = meta.max != null && value.length > meta.max;

  const col = `sa-span-${span ?? baseSpan(name, value)}`;
  const set = (v: string) => onChange(setIn(root, path, v));

  const help = (meta.help || near) ? (
    <span className="sa-field-foot">
      <span>{meta.help ?? ''}</span>
      {near && (
        <span className={`sa-counter${over ? ' over' : ''}`}>
          {over ? `${value.length - meta.max!} de más` : `${value.length}/${meta.max}`}
        </span>
      )}
    </span>
  ) : undefined;

  return (
    <div className={col}>
      <Field
        label={<>{meta.label}{translating && empty && <span className="sa-tag-warn">sin traducir</span>}</>}
        help={help}
      >
        {long
          ? <textarea className="form-control" rows={3} value={value} onChange={e => set(e.target.value)} />
          : <input className="form-control" value={value} onChange={e => set(e.target.value)} />}
      </Field>

      {translating && typeof reference === 'string' && reference !== '' && (
        <div className="sa-ref mt-2">
          <span className="txt"><strong>ES:</strong> {reference}</span>
          {empty && (
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill py-0 px-2"
                    onClick={() => set(reference)}>
              <i className="fa-regular fa-copy me-1" aria-hidden="true" />Copiar
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
    <SectionCard title={meta.label} icon="fa-list" description={meta.help ?? `${list.length} ${list.length === 1 ? 'elemento' : 'elementos'}`}>
      {list.length === 0 && <p className="bugie-muted small mb-2">Todavía no hay elementos.</p>}

      {!ofObjects && list.map((item, i) => (
        <div key={i} className="sa-row-input">
          <span className="small bugie-muted" aria-hidden="true">{i + 1}</span>
          <input className="form-control" value={String(item ?? '')} aria-label={`${meta.label} ${i + 1}`}
                 onChange={e => replace(list.map((v, j) => (j === i ? e.target.value : v)))} />
          <MoveButtons i={i} total={list.length} onMove={move} onRemove={remove} />
        </div>
      ))}

      {ofObjects && list.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`sa-acc${isOpen ? ' open' : ''}`}>
            <div className="sa-acc-head">
              <button type="button" className="sa-acc-toggle"
                      aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                <span className="num">{i + 1}</span>
                <span className="name">{itemTitle(item, i)}</span>
              </button>
              <MoveButtons i={i} total={list.length} onMove={move} onRemove={remove} />
            </div>

            {isOpen && (
              <div className="sa-acc-body">
                <div className="sa-grid">
                  {scalarEntries(item as object).map(([k, v], j, arr) => (
                    <TextField key={k} name={k} value={String(v ?? '')} path={[...path, i, k]} root={root}
                               span={spansOf(arr)[j]} onChange={onChange} translating={translating} inList
                               reference={reference ? getIn(reference, [i, k]) : undefined} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="sa-add" onClick={add}>
        <i className="fa-solid fa-plus me-2" aria-hidden="true" />Agregar elemento
      </button>
    </SectionCard>
  );
}

function MoveButtons({ i, total, onMove, onRemove }: {
  i: number; total: number; onMove: (i: number, d: number) => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="sa-acc-btns">
      <IconButton icon="fa-arrow-up" label="Subir" size="sm" variant="ghost"
                  disabled={i === 0} onClick={() => onMove(i, -1)} />
      <IconButton icon="fa-arrow-down" label="Bajar" size="sm" variant="ghost"
                  disabled={i === total - 1} onClick={() => onMove(i, 1)} />
      <IconButton icon="fa-trash" label="Quitar" size="sm" variant="danger"
                  onClick={() => onRemove(i)} />
    </div>
  );
}
