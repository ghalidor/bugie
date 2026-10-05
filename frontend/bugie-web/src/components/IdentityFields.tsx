import { Field, FormGrid, InfoItem, Select } from './ui';
import {
  cleanDocNumber, docTypeLabel, DOC_TYPE_OPTIONS, DocType, IdentityErrors, IdentityForm, MeProfile,
} from '../state/identity';

interface Props {
  value: IdentityForm;
  onChange: (v: IdentityForm) => void;
  errors: IdentityErrors;
  /** true tras intentar enviar: muestra también los errores de campos vacíos. */
  showAll: boolean;
  /** El documento ya está registrado: se muestra bloqueado. */
  docLocked?: boolean;
  disabled?: boolean;
}

/** Tipo y número de documento + nombres y apellidos (registro y completar datos). */
export default function IdentityFields({ value, onChange, errors, showAll, docLocked, disabled }: Props) {
  const set = (patch: Partial<IdentityForm>) => onChange({ ...value, ...patch });
  // Errores en vivo: se muestran si el campo tiene texto o si ya se intentó enviar.
  const err = (k: keyof IdentityForm) => (showAll || value[k].trim() ? errors[k] : undefined);

  return (
    <FormGrid>
      {docLocked ? (
        <Field label="Documento" help="Ya está registrado. Para corregirlo contacta a soporte." span="full">
          <input className="form-control" value={`${docTypeLabel(value.docType)} ${value.docNumber}`} disabled />
        </Field>
      ) : (
        <>
          <Field label="Tipo de documento" required>
            <Select<DocType>
              value={value.docType}
              options={DOC_TYPE_OPTIONS}
              disabled={disabled}
              onChange={t => set({ docType: t, docNumber: cleanDocNumber(t, value.docNumber) })}
            />
          </Field>
          <Field label="Número de documento" required error={err('docNumber')}
                 help={value.docType === 'DNI' ? '8 dígitos.' : 'Solo letras y números, sin espacios.'}>
            <input
              className="form-control"
              value={value.docNumber}
              disabled={disabled}
              inputMode={value.docType === 'DNI' ? 'numeric' : 'text'}
              maxLength={value.docType === 'DNI' ? 8 : 12}
              autoComplete="off"
              onChange={e => set({ docNumber: cleanDocNumber(value.docType, e.target.value) })}
            />
          </Field>
        </>
      )}

      <Field label="Nombres" required error={err('firstNames')} span="full">
        <input className="form-control" value={value.firstNames} maxLength={60} disabled={disabled}
               autoComplete="given-name" onChange={e => set({ firstNames: e.target.value })} />
      </Field>
      <Field label="Apellido paterno" required error={err('lastNamePaternal')}>
        <input className="form-control" value={value.lastNamePaternal} maxLength={40} disabled={disabled}
               autoComplete="family-name" onChange={e => set({ lastNamePaternal: e.target.value })} />
      </Field>
      <Field label="Apellido materno" optional error={err('lastNameMaternal')}
             help="Si tienes un solo apellido, déjalo vacío.">
        <input className="form-control" value={value.lastNameMaternal} maxLength={40} disabled={disabled}
               onChange={e => set({ lastNameMaternal: e.target.value })} />
      </Field>
    </FormGrid>
  );
}

/** Nombres, apellidos y documento para mostrar en el perfil (solo lectura). */
export function identityInfoItems(me: MeProfile | null): InfoItem[] {
  const lastNames = [me?.lastNamePaternal, me?.lastNameMaternal].filter(Boolean).join(' ');
  return [
    { label: 'Nombres', value: me?.firstNames || '—' },
    { label: 'Apellidos', value: lastNames || '—' },
    { label: 'Documento', value: me?.docType && me.docNumber ? `${docTypeLabel(me.docType)} ${me.docNumber}` : '—' },
  ];
}
