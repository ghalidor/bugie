import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { PERMS, usePermissions } from '../../state/permissions';
import {
  EmptyState, Field, FormGrid, Page, SaveBar, SectionCard, Skeleton, useConfirm, useToast, useUnsavedChanges,
} from '../../components/ui';
import './siteAdmin.scss';

/**
 * Datos de la empresa: razón social, RUC, dirección fiscal y logo.
 * Una sola fuente (landing.systemsettings). Se usan en el Libro de
 * Reclamaciones (web y correos) y en el pie de la web pública.
 * Teléfono y correo son los de soporte (se editan en Configuración).
 * API: GET /landing/company · PUT /landing/admin/company · POST /landing/admin/company/logo
 */

interface Company {
  legalName: string; ruc: string; address: string; logoUrl: string;
  supportEmail: string; supportPhone: string; city: string;
}
type Form = Pick<Company, 'legalName' | 'ruc' | 'address'>;

const EMPTY: Form = { legalName: '', ruc: '', address: '' };

/** El logo lo sirve la API de Landing en /uploads (URL relativa). */
const logoSrc = (url: string) => !url || /^https?:\/\//i.test(url)
  ? url
  : `${API.landing.replace(/\/api\/?$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.legalName.trim()) e.legalName = 'La razón social es obligatoria.';
  if (f.ruc.trim() && !/^\d{11}$/.test(f.ruc.trim())) e.ruc = 'El RUC debe tener 11 dígitos.';
  return e;
}

export default function CompanyInfo() {
  const { has, loading: permsLoading } = usePermissions();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm]       = useState<Form>(EMPTY);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const allowed = has(PERMS.ViewCompany);
  const original: Form = company ? { legalName: company.legalName, ruc: company.ruc, address: company.address } : EMPTY;
  const dirty = !!company && (form.legalName !== original.legalName || form.ruc !== original.ruc || form.address !== original.address);
  useUnsavedChanges(dirty);
  const errors = validate(form);

  useEffect(() => { if (allowed) load(); /* eslint-disable-next-line */ }, [allowed]);

  async function load() {
    setLoadErr(null);
    try {
      apply(await apiFetch<Company>(`${API.landing}/landing/company`));
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar los datos de la empresa.');
    }
  }

  function apply(c: Company) {
    setCompany(c);
    setForm({ legalName: c.legalName, ruc: c.ruc, address: c.address });
    setTouched(false);
  }

  async function save() {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      apply(await apiFetch<Company>(`${API.landing}/landing/admin/company`, {
        method: 'PUT',
        body: JSON.stringify({ legalName: form.legalName.trim(), ruc: form.ruc.trim(), address: form.address.trim() }),
      }));
      toast.success('Datos de la empresa guardados.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) { toast.error('El logo no puede pesar más de 2 MB.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Cliente común (maneja 401/403); con FormData quita el Content-Type JSON.
      const c = await apiFetch<Company>(`${API.landing}/landing/admin/company/logo`, { method: 'POST', body: fd });
      // Solo cambia el logo: no pisar lo que se esté editando en el formulario.
      setCompany(prev => prev ? { ...prev, logoUrl: c.logoUrl } : c);
      toast.success('Logo actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo subir el logo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeLogo() {
    if (!company) return;
    const ok = await confirm({
      title: '¿Quitar el logo?',
      message: 'El Libro de Reclamaciones y sus correos mostrarán el nombre "Bugie" en su lugar.',
      confirmText: 'Quitar logo', tone: 'danger',
    });
    if (!ok) return;
    setUploading(true);
    try {
      const c = await apiFetch<Company>(`${API.landing}/landing/admin/company`, {
        method: 'PUT',
        body: JSON.stringify({ legalName: original.legalName, ruc: original.ruc, address: original.address, logoUrl: '' }),
      });
      setCompany(prev => prev ? { ...prev, logoUrl: c.logoUrl } : c);
      toast.success('Logo quitado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar el logo.');
    } finally {
      setUploading(false);
    }
  }

  if (!permsLoading && !allowed) {
    return (
      <Page title="Datos de la empresa" icon="fa-building">
        <SectionCard>
          <EmptyState icon="fa-lock" title="Sin acceso" text="No tienes permiso para ver los datos de la empresa." />
        </SectionCard>
      </Page>
    );
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const showErr = (k: keyof Form) => (touched || form[k] !== original[k]) ? errors[k] : undefined;

  return (
    <Page
      title="Datos de la empresa"
      subtitle="Razón social, RUC, dirección fiscal y logo. Salen en el Libro de Reclamaciones y el pie de la web."
      icon="fa-building"
      helpKey="company"
    >
      {loadErr && (
        <div className="sa-note bx-tone-bad mb-3" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
        </div>
      )}

      {!company && !loadErr ? (
        <SectionCard><Skeleton height={56} count={4} /></SectionCard>
      ) : company && (
        <div className="d-grid gap-3">
          <SectionCard title="Datos legales" icon="fa-file-contract" tourId="company-legal"
                       description="Aparecen en la cabecera de la Hoja de Reclamación y en sus correos.">
            <FormGrid>
              <Field label="Razón social" required error={showErr('legalName')}>
                <input className="form-control" maxLength={200} value={form.legalName} onChange={set('legalName')} />
              </Field>
              <Field label="RUC" optional help="11 dígitos." error={showErr('ruc')}>
                <input className="form-control" inputMode="numeric" maxLength={11} value={form.ruc} onChange={set('ruc')} />
              </Field>
              <Field label="Dirección fiscal" optional span="full">
                <input className="form-control" maxLength={300} value={form.address} onChange={set('address')} />
              </Field>
            </FormGrid>
          </SectionCard>

          <SectionCard title="Logo" icon="fa-image" tourId="company-logo"
                       description="PNG, JPG o WEBP de hasta 2 MB. Si no hay logo se muestra el nombre Bugie.">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <div className="sa-bubble d-flex align-items-center justify-content-center"
                   style={{ width: 140, height: 140 }}>
                {company.logoUrl
                  ? <img src={logoSrc(company.logoUrl)} alt="Logo de la empresa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <span className="fw-bold fs-4" style={{ color: 'var(--bugie-primary)' }}>Bugie</span>}
              </div>
              <div className="d-flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                       onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                <button type="button" className="btn btn-bugie" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading
                    ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Subiendo…</>
                    : <><i className="fa-solid fa-upload me-2" aria-hidden="true" />{company.logoUrl ? 'Cambiar logo' : 'Subir logo'}</>}
                </button>
                {company.logoUrl && (
                  <button type="button" className="btn btn-bugie-outline" disabled={uploading} onClick={removeLogo}>
                    <i className="fa-solid fa-trash me-2" aria-hidden="true" />Quitar
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Contacto" icon="fa-headset" tourId="company-contact"
                       description="Son el teléfono y el correo de soporte: se editan en Configuración para no duplicarlos.">
            <FormGrid>
              <div>
                <div className="small bugie-muted">Correo de soporte</div>
                <div>{company.supportEmail || '—'}</div>
              </div>
              <div>
                <div className="small bugie-muted">Teléfono de soporte</div>
                <div>{company.supportPhone || '—'}</div>
              </div>
            </FormGrid>
            <Link to="/admin/configuracion" className="btn btn-sm btn-bugie-outline rounded-pill mt-3">
              <i className="fa-solid fa-gear me-1" aria-hidden="true" />Ir a Configuración
            </Link>
          </SectionCard>
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save}
               onDiscard={() => { setForm(original); setTouched(false); }} />
    </Page>
  );
}
