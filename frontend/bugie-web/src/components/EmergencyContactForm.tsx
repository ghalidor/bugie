import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../state/api';
import { Field, FormActions, FormGrid, InfoList, Notice, SectionCard, Skeleton, useToast } from './ui';

/// Contacto de emergencia del usuario actual (pasajero o conductor).
/// GET/PUT /api/auth/me/emergency-contact. Un contacto por usuario.
/// Si activas un SOS y el contacto tiene correo, Bugie le avisa por correo
/// con tu ubicación.
interface EmergencyContact {
  fullName: string;
  phone: string;
  relationship: string;
  email: string | null;
}

const EMPTY = { fullName: '', phone: '', relationship: '', email: '' };

export default function EmergencyContactForm() {
  const toast = useToast();
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [form,    setForm]    = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EmergencyContact | null>(`${API.auth}/auth/me/emergency-contact`)
      .then(c => setContact(c))
      .catch(() => setError('No se pudo cargar tu contacto de emergencia.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (f: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  function startEdit() {
    setForm(contact
      ? { fullName: contact.fullName, phone: contact.phone,
          relationship: contact.relationship, email: contact.email ?? '' }
      : EMPTY);
    setError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const saved = await apiFetch<EmergencyContact>(`${API.auth}/auth/me/emergency-contact`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, email: form.email.trim() || null }),
      });
      setContact(saved);
      setEditing(false);
      toast.success('Contacto de emergencia guardado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el contacto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Contacto de emergencia"
      icon="fa-user-shield"
      description="A quién avisamos si activas un SOS."
      actions={!loading && !editing && contact && (
        <button type="button" className="btn btn-sm btn-bugie-outline" onClick={startEdit}>
          <i className="fa-solid fa-pen" aria-hidden="true" />Editar
        </button>
      )}
    >
      {loading ? (
        <Skeleton count={3} />
      ) : (
        <div className="bx-stack">
          {error && <Notice tone="bad">{error}</Notice>}

          {editing ? (
            <form onSubmit={save} className="bx-form">
              <FormGrid>
                <Field label="Nombre completo" required>
                  <input className="form-control" value={form.fullName} onChange={set('fullName')} maxLength={120} autoComplete="off" />
                </Field>
                <Field label="Teléfono" required>
                  <input className="form-control" type="tel" value={form.phone} onChange={set('phone')}
                         placeholder="+51 999 999 999" maxLength={20} autoComplete="off" />
                </Field>
                <Field label="Parentesco o relación" required>
                  <input className="form-control" value={form.relationship} onChange={set('relationship')}
                         placeholder="Ej. Mamá, esposo, amiga" maxLength={50} />
                </Field>
                <Field label="Correo" optional help="Si activas un SOS, le enviaremos un correo con tu ubicación.">
                  <input className="form-control" type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="off" />
                </Field>
              </FormGrid>
              <FormActions>
                <button className="btn btn-bugie-outline" type="button" disabled={saving} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button className="btn btn-bugie" type="submit" disabled={saving}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Guardando…</>
                    : <><i className="fa-solid fa-floppy-disk" aria-hidden="true" />Guardar contacto</>}
                </button>
              </FormActions>
            </form>
          ) : contact ? (
            <InfoList items={[
              { label: 'Nombre', value: contact.fullName },
              { label: 'Relación', value: contact.relationship },
              { label: 'Teléfono', value: <a href={`tel:${contact.phone}`}>{contact.phone}</a> },
              { label: 'Correo', value: contact.email ?? '—' },
            ]} />
          ) : (
            <Notice
              tone="warn"
              title="Aún no registras un contacto"
              action={
                <button type="button" className="btn btn-sm btn-bugie" onClick={startEdit}>
                  <i className="fa-solid fa-plus" aria-hidden="true" />Agregar contacto
                </button>
              }
            >
              Te lo recomendamos: si activas un SOS, el equipo de Bugie podrá llamarlo y, si tiene correo,
              le avisaremos con tu ubicación.
            </Notice>
          )}
        </div>
      )}
    </SectionCard>
  );
}
