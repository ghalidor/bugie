import { useState } from 'react';
import { Field, FormActions, FormGrid, Notice, SectionCard, useConfirm, useToast } from './ui';
import { API, apiFetch, ApiError } from '../state/api';
import { getUser, saveSession } from '../state/session';

const MIN = 8;
const MAX = 100;
const EMPTY = { current: '', next: '', confirm: '' };

/** Sección Seguridad del perfil: cambiar la contraseña (POST /api/auth/me/change-password). */
export default function ChangePasswordCard() {
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Errores en vivo (solo cuando el campo tiene algo escrito).
  const nextErr = !form.next ? undefined
    : form.next.length < MIN || form.next.length > MAX ? `Debe tener entre ${MIN} y ${MAX} caracteres.`
    : form.next === form.current ? 'La nueva contraseña debe ser distinta de la actual.'
    : undefined;
  const confirmErr = form.confirm && form.confirm !== form.next ? 'Las contraseñas no coinciden.' : undefined;
  const canSave = !!form.current && !!form.next && !!form.confirm && !nextErr && !confirmErr && !saving;

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const ok = await confirm({
      title: '¿Cambiar tu contraseña?',
      message: 'Se cerrará tu sesión en tus otros dispositivos (app, otros navegadores). La próxima vez que inicies sesión deberás usar la nueva contraseña.',
      confirmText: 'Cambiar contraseña',
    });
    if (!ok) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch<{ success: boolean; message: string; token?: string }>(`${API.auth}/auth/me/change-password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      // El cambio cierra todas las sesiones: esta sigue con el token nuevo.
      const user = getUser();
      if (res?.token && user) saveSession(res.token, user);
      toast.success(res?.message ?? 'Tu contraseña fue cambiada.');
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Seguridad" icon="fa-key" description="Cambia la contraseña con la que inicias sesión.">
      <form onSubmit={save} className="bx-form" noValidate>
        <FormGrid>
          <Field label="Contraseña actual" required span="full">
            <input type="password" className="form-control" value={form.current} maxLength={MAX}
                   autoComplete="current-password" disabled={saving} onChange={set('current')} />
          </Field>
          <Field label="Nueva contraseña" required error={nextErr} help={`Entre ${MIN} y ${MAX} caracteres.`}>
            <input type="password" className="form-control" value={form.next} maxLength={MAX}
                   autoComplete="new-password" disabled={saving} onChange={set('next')} />
          </Field>
          <Field label="Confirma la nueva contraseña" required error={confirmErr}>
            <input type="password" className="form-control" value={form.confirm} maxLength={MAX}
                   autoComplete="new-password" disabled={saving} onChange={set('confirm')} />
          </Field>
        </FormGrid>
        {error && <Notice tone="bad">{error}</Notice>}
        <FormActions>
          <button className="btn btn-bugie" type="submit" disabled={!canSave}>
            {saving
              ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Guardando…</>
              : <><i className="fa-solid fa-key" aria-hidden="true" />Cambiar contraseña</>}
          </button>
        </FormActions>
      </form>
    </SectionCard>
  );
}
