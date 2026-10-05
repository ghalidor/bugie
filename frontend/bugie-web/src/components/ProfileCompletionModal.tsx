import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IdentityFields from './IdentityFields';
import { Modal, Notice, useConfirm, useToast } from './ui';
import { API, apiFetch, ApiError } from '../state/api';
import { clearSession, getToken, getUser, saveSession } from '../state/session';
import {
  EMPTY_IDENTITY, IdentityForm, identityPayload, MeProfile, validateIdentity,
} from '../state/identity';

/**
 * Si GET /api/auth/me trae needsProfileCompletion=true, pide documento y nombres
 * en una ventana que no se puede cerrar (la única salida es cerrar sesión).
 * `onCompleted` se llama cuando el backend acepta los datos.
 */
export default function ProfileCompletionModal({ onCompleted }: { onCompleted: () => void }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IdentityForm>(EMPTY_IDENTITY);
  const [docLocked, setDocLocked] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeProfile>(`${API.auth}/auth/me`)
      .then(me => {
        if (!me?.needsProfileCompletion) return;
        const hasDoc = !!me.docType && !!me.docNumber;
        setDocLocked(hasDoc);
        setForm({
          docType: me.docType ?? 'DNI',
          docNumber: me.docNumber ?? '',
          firstNames: me.firstNames ?? '',
          lastNamePaternal: me.lastNamePaternal ?? '',
          lastNameMaternal: me.lastNameMaternal ?? '',
        });
        setOpen(true);
      })
      .catch(() => { /* sin conexión: se volverá a revisar al entrar de nuevo */ });
  }, []);

  const errors = validateIdentity(form, docLocked);

  async function save() {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    const ok = await confirm({
      title: '¿Guardar tus datos?',
      message: 'Revisa que tu documento y tus nombres estén bien escritos. Después solo soporte podrá corregirlos.',
      confirmText: 'Guardar',
    });
    if (!ok) return;
    setSaving(true); setError(null);
    try {
      const me = await apiFetch<MeProfile>(`${API.auth}/auth/me/profile-completion`, {
        method: 'PUT',
        body: JSON.stringify(identityPayload(form, !docLocked)),
      });
      // Refresca el nombre guardado en la sesión.
      const token = getToken();
      const user = getUser();
      if (token && user && me?.fullName) saveSession(token, { ...user, fullName: me.fullName });
      setOpen(false);
      toast.success('Tus datos fueron guardados.');
      onCompleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    clearSession();
    navigate('/', { replace: true });
  }

  return (
    <Modal
      open={open}
      onClose={() => { /* no se puede omitir */ }}
      closeOnBackdrop={false}
      hideClose
      title="Completa tus datos"
      description="Para seguir usando Bugie necesitamos tu documento de identidad y tus nombres completos."
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={logout} disabled={saving}>
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Cerrar sesión
          </button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving}>
            {saving
              ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Guardando…</>
              : <><i className="fa-solid fa-floppy-disk" aria-hidden="true" />Guardar datos</>}
          </button>
        </>
      }
    >
      <form className="bx-form" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <IdentityFields value={form} onChange={setForm} errors={errors} showAll={tried}
                        docLocked={docLocked} disabled={saving} />
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
