import { useCallback } from 'react';
import { API, ApiError, apiFetch } from '../../../state/api';
import { useConfirm, useToast } from '../../../components/ui';
import { fmtDateTime, roleLabel } from './types';

const MIN_TEXT = 3;

const errMsg = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : 'error desconocido');

/**
 * Pide un texto obligatorio (motivo / nota) de al menos 3 caracteres.
 * Si es muy corto, avisa y vuelve a pedirlo conservando lo escrito.
 * Devuelve null si el usuario cancela.
 */
function useAskText() {
  const confirm = useConfirm();
  const toast = useToast();
  return useCallback(async (opts: Parameters<typeof confirm>[0]): Promise<string | null> => {
    let draft = '';
    for (;;) {
      const r = await confirm({ ...opts, reason: 'required', reasonDefault: draft });
      if (!r) return null;
      if (r.reason.trim().length >= MIN_TEXT) return r.reason.trim();
      toast.warning(`Escribe al menos ${MIN_TEXT} caracteres.`);
      draft = r.reason;
    }
  }, [confirm, toast]);
}

export interface ResolvableSos { id: string; userRole: string; createdAt: string; }

/** Desactivar (resolver) una alerta SOS con motivo obligatorio. Devuelve true si se resolvió. */
export function useResolveSos() {
  const ask = useAskText();
  const toast = useToast();
  return useCallback(async (a: ResolvableSos): Promise<boolean> => {
    const reason = await ask({
      title: 'Desactivar alerta SOS',
      tone: 'danger',
      message: <>Emergencia de <strong>{roleLabel(a.userRole)}</strong>, reportada el {fmtDateTime(a.createdAt)}. Antes de desactivarla, confirma que la persona está bien.</>,
      reasonLabel: 'Motivo de desactivación',
      reasonPlaceholder: 'Ej: Falsa alarma confirmada por teléfono. El pasajero llegó bien.',
      confirmText: 'Desactivar alerta',
    });
    if (!reason) return false;
    try {
      await apiFetch(`${API.trips}/sos/${a.id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      toast.success('La alerta SOS quedó desactivada.');
      return true;
    } catch (err) {
      toast.error(`No se pudo desactivar la alerta: ${errMsg(err)}`);
      return false;
    }
  }, [ask, toast]);
}

export interface ReviewableDeviation { id: string; startedAt: string; distanceM: number; status: 'open' | 'closed'; }

/** Marcar un desvío de ruta como revisado (nota obligatoria). Devuelve true si se guardó. */
export function useReviewDeviation() {
  const ask = useAskText();
  const toast = useToast();
  return useCallback(async (dv: ReviewableDeviation, driverName: string): Promise<boolean> => {
    const note = await ask({
      title: 'Revisar desvío de ruta',
      tone: 'warning',
      message: <>
        <strong>{driverName}</strong> · detectado el {fmtDateTime(dv.startedAt)}, a {Math.round(dv.distanceM)} m de la ruta
        {dv.status === 'open' ? ' (sigue desviado)' : ' (ya volvió a la ruta)'}.
      </>,
      reasonLabel: 'Nota de revisión',
      reasonPlaceholder: 'Ej: Llamé al conductor, tomó otra calle por obras.',
      confirmText: 'Marcar revisada',
    });
    if (!note) return false;
    try {
      await apiFetch(`${API.trips}/trips/admin/deviations/${dv.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      toast.success('Desvío marcado como revisado.');
      return true;
    } catch (err) {
      toast.error(`No se pudo marcar como revisada: ${errMsg(err)}`);
      return false;
    }
  }, [ask, toast]);
}
