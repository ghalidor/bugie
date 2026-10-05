// Documento de identidad y nombres separados (mismas reglas que el backend).

export type DocType = 'DNI' | 'CE' | 'PASAPORTE';

export const DOC_TYPE_OPTIONS: Array<{ value: DocType; label: string }> = [
  { value: 'DNI',       label: 'DNI' },
  { value: 'CE',        label: 'Carné de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];

export function docTypeLabel(t?: string | null): string {
  return DOC_TYPE_OPTIONS.find(o => o.value === t)?.label ?? (t ?? '');
}

/** Datos de GET /api/auth/me (UserProfileDto). */
export interface MeProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  profilePhotoUrl: string | null;
  createdAt: string;
  docType: DocType | null;
  docNumber: string | null;
  firstNames: string | null;
  lastNamePaternal: string | null;
  lastNameMaternal: string | null;
  needsProfileCompletion: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
}

/** Limpia lo que escribe el usuario: sin espacios, mayúsculas; DNI solo dígitos (máx 8). */
export function cleanDocNumber(type: DocType, raw: string): string {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  if (type === 'DNI') return v.replace(/\D/g, '').slice(0, 8);
  return v.replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** Error del número de documento o null si está bien. */
export function docNumberError(type: DocType, n: string): string | null {
  if (!n) return 'El número de documento es obligatorio.';
  if (type === 'DNI' && !/^\d{8}$/.test(n)) return 'El DNI debe tener 8 dígitos.';
  if (type === 'CE' && !/^[A-Z0-9]{9,12}$/.test(n))
    return 'El carné de extranjería debe tener entre 9 y 12 caracteres (solo letras y números).';
  if (type === 'PASAPORTE' && !/^[A-Z0-9]{6,12}$/.test(n))
    return 'El pasaporte debe tener entre 6 y 12 caracteres (solo letras y números).';
  return null;
}

const NAME_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/;

/** Error de un nombre o apellido o null si está bien. `requiredMsg` = mensaje si está vacío; sin él, el campo es opcional. */
export function nameError(value: string, label: string, max: number, requiredMsg?: string): string | null {
  const v = value.trim();
  if (!v) return requiredMsg ?? null;
  if (v.length > max) return `${label} admite como máximo ${max} caracteres.`;
  if (!NAME_RE.test(v)) return `${label} solo admite letras, espacios, apóstrofo, punto y guion.`;
  return null;
}

export interface IdentityForm {
  docType: DocType;
  docNumber: string;
  firstNames: string;
  lastNamePaternal: string;
  lastNameMaternal: string;
}

export const EMPTY_IDENTITY: IdentityForm = {
  docType: 'DNI', docNumber: '', firstNames: '', lastNamePaternal: '', lastNameMaternal: '',
};

export type IdentityErrors = Partial<Record<keyof IdentityForm, string>>;

/** Valida el formulario. Con `skipDoc` no se revisa el documento (ya registrado). */
export function validateIdentity(f: IdentityForm, skipDoc = false): IdentityErrors {
  const e: IdentityErrors = {};
  if (!skipDoc) {
    const d = docNumberError(f.docType, f.docNumber);
    if (d) e.docNumber = d;
  }
  const fn = nameError(f.firstNames, 'Los nombres', 60, 'Los nombres son obligatorios.');
  if (fn) e.firstNames = fn;
  const lp = nameError(f.lastNamePaternal, 'El apellido paterno', 40, 'El apellido paterno es obligatorio.');
  if (lp) e.lastNamePaternal = lp;
  const lm = nameError(f.lastNameMaternal, 'El apellido materno', 40);
  if (lm) e.lastNameMaternal = lm;
  return e;
}

/** Cuerpo para el backend (apellido materno vacío = null). */
export function identityPayload(f: IdentityForm, includeDoc = true) {
  return {
    ...(includeDoc ? { docType: f.docType, docNumber: f.docNumber } : {}),
    firstNames: f.firstNames.trim(),
    lastNamePaternal: f.lastNamePaternal.trim(),
    lastNameMaternal: f.lastNameMaternal.trim() || null,
  };
}
