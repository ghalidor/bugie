import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import UserTripsSection from '../../components/UserTripsSection';
import { API, apiFetch, ApiError } from '../../state/api';
import { DriverPayoutsSection } from './DriverPayouts';
import DriverApprovalModal from '../../components/DriverApprovalModal';
import DriverTimeline from '../../components/DriverTimeline';
import DriverSuspendModal, { SuspendData, ymdToDisplay } from '../../components/DriverSuspendModal';
import EmergencyContactCard from '../../components/EmergencyContactCard';
import { DriverPresenceSection } from './DriverPresenceSection';
import {
  Checkbox, Drawer, EmptyState, Page, SectionCard, Skeleton, StatusBadge, Tabs, useConfirm, useTabParam, useToast,
} from '../../components/ui';
import {
  Avatar, Checklist, CopyRow, DocPreviewModal, DocStatusBadge, DriverStatusBadge, InfoRow, StarRating, TermsBlock,
  DRIVER_DOC_LABEL, DRIVER_STATUS, driverDocMeta, fileUrl, fmtDate, fmtDateTime, fmtDay,
} from './people/PeopleShared';
import {
  AccountAccessCard, AccountIdentity, DeactivatedBadge, DeletedAccountBanner, IdentityCard, IncompleteBadge,
} from './people/AccountShared';
import UserNotifications from './people/UserNotifications';

interface DriverDto {
  id: string; userId: string; fullName?: string;
  deletedAt?: string | null; deletedReason?: string | null;
  status: number; isOnline: boolean;
  rating: number; totalRatings: number;
  createdAt: string; approvedAt: string | null;
  // Foto de perfil (URL relativa tipo "/uploads/profiles/..").
  profilePhotoUrl?: string | null;
  // Aprobación por excepción: fecha límite para completar documentos,
  // faltas acumuladas y documentos obligatorios que faltan (calculados en el backend).
  documentsDeadline?: string | null;
  strikes?: number;
  missingDocuments?: string[] | null;
  // Rechazo / suspensión (solo con status 4 o 5) y solicitud de revisión abierta.
  statusReason?: string | null;
  suspendedUntil?: string | null;   // null con status 4 = suspensión indefinida
  openReviewRequest?: { id: string; message: string; createdAt: string } | null;
}
interface DriverDetailResponse {
  driver: DriverDto;
  vehicles: Vehicle[];
  userInfo?: UserInfo | null;
  lastStatusChangeAt?: string | null;
  lastStatusChangeBy?: string | null;
}
interface Vehicle {
  id: string; plate: string; brand: string;
  model: string; year: number; color: string; isActive: boolean;
  photoUrl?: string | null;
}
/// Datos del usuario (vienen del módulo Auth a través del backend de Drivers).
interface UserInfo extends AccountIdentity {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  termsAccepted?: boolean;
  signatureImage?: string | null;
}
interface Doc {
  id: string; docType: string; fileUrl: string;
  originalFileName: string | null; mimeType: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  rejectionReason: string | null;
  expiresAt: string | null; createdAt: string;
}

const TABS = ['resumen', 'viajes', 'documentos', 'vehiculos', 'calificaciones', 'conexiones', 'pagos', 'notificaciones', 'historial'];

const REASON = { reason: 'required' as const, reasonMinLength: 10, reasonMaxLength: 500 };

export default function DriverDetail() {
  const { driverId } = useParams<{ driverId: string }>();
  const toast   = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useTabParam(TABS);

  const [driver,   setDriver]   = useState<DriverDto | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [docs,     setDocs]     = useState<Doc[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Checks de revisión (solo en memoria, no se persisten)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<Doc | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  // Histórico de documentos (superseded)
  const [showHistory,    setShowHistory]    = useState(false);
  const [history,        setHistory]        = useState<Doc[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState<string | null>(null);
  const [historyPreview, setHistoryPreview] = useState<Doc | null>(null);

  // Aprobación por excepción (modal con motivo) + recarga de la auditoría
  const [showException,  setShowException]  = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [auditKey,       setAuditKey]       = useState(0);

  // Último cambio de estado (quién y cuándo) y acciones de estado en curso
  const [lastChange, setLastChange] = useState<{ at: string | null; by: string | null }>({ at: null, by: null });
  const [statusBusy, setStatusBusy] = useState(false);
  const [showSuspend,  setShowSuspend]  = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  useEffect(() => { if (driverId) load(driverId); }, [driverId]);

  // Recarga solo el conductor (documentos faltantes, plazo, faltas) sin
  // tocar la lista de documentos ni el indicador de carga general.
  async function refreshDriver(id: string) {
    try {
      const detail = await apiFetch<DriverDetailResponse>(`${API.drivers}/drivers/${id}/detail`);
      setDriver(detail.driver);
      setUserInfo(detail.userInfo ?? null);
      setLastChange({ at: detail.lastStatusChangeAt ?? null, by: detail.lastStatusChangeBy ?? null });
    } catch { /* no crítico: se verá al recargar */ }
  }

  /// Tras corregir datos de la cuenta o restaurarla: recarga y refresca el historial.
  function refreshAccount() {
    if (!driver) return;
    refreshDriver(driver.id);
    setAuditKey(k => k + 1);
  }

  async function load(id: string) {
    setLoading(true); setError(null);
    try {
      const detail = await apiFetch<DriverDetailResponse>(`${API.drivers}/drivers/${id}/detail`);
      setDriver(detail.driver);
      setLastChange({ at: detail.lastStatusChangeAt ?? null, by: detail.lastStatusChangeBy ?? null });
      setVehicles(detail.vehicles ?? []);
      setUserInfo(detail.userInfo ?? null);

      const list = await apiFetch<Doc[]>(`${API.drivers}/drivers/documents/by-driver/${id}`);
      setDocs(list);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el conductor.');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (!driverId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setShowHistory(true);
    try {
      const all = await apiFetch<Doc[]>(`${API.drivers}/drivers/documents/by-driver/${driverId}/history`);
      // Solo los reemplazados (los activos ya están en la lista principal)
      setHistory(all.filter(d => d.status === 'superseded'));
    } catch (e: any) {
      setHistoryError(e instanceof ApiError ? e.message : 'No se pudo cargar el histórico.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function approveDoc(doc: Doc) {
    const ok = await confirm({
      title: `¿Aprobar ${driverDocMeta(doc.docType).label}?`,
      message: 'Confirma que revisaste el documento: que se lee bien, está vigente y corresponde al conductor.',
      confirmText: 'Aprobar documento',
    });
    if (!ok) return;
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(`${API.drivers}/drivers/documents/${doc.id}/approve`, { method: 'PUT' });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      setReviewed(prev => new Set([...prev, doc.id]));
      toast.success(`${driverDocMeta(doc.docType).label} aprobado.`);
      // Puede haber completado los documentos (y cerrado el plazo)
      if (driver) { refreshDriver(driver.id); setAuditKey(k => k + 1); }
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo aprobar el documento.');
    } finally { setActingDoc(null); }
  }

  async function rejectDoc(doc: Doc) {
    const res = await confirm({
      title: `¿Rechazar ${driverDocMeta(doc.docType).label}?`,
      message: 'El conductor verá el motivo y tendrá que subir el documento otra vez.',
      tone: 'danger', confirmText: 'Rechazar documento',
      reason: 'required', reasonLabel: 'Motivo del rechazo', reasonPlaceholder: 'Ej.: El SOAT está vencido.',
    });
    if (!res) return;
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(`${API.drivers}/drivers/documents/${doc.id}/reject`,
        { method: 'PUT', body: JSON.stringify({ reason: res.reason }) });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      toast.info('Documento rechazado.');
      if (driver) refreshDriver(driver.id);
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo rechazar el documento.');
    } finally { setActingDoc(null); }
  }

  // Aprobación normal (documentos completos): PUT sin motivo.
  // Por excepción: PUT con { reason } desde el modal.
  async function approveDriver(reason?: string) {
    if (!driver) return;
    // Por excepción ya se confirmó en el modal (con motivo); la normal se confirma aquí.
    if (!reason) {
      const ok = await confirm({
        title: '¿Aprobar el registro de este conductor?',
        message: 'Podrá conectarse y recibir viajes desde ahora. Le llegará un aviso y un correo.',
        confirmText: 'Aprobar conductor',
      });
      if (!ok) return;
    }
    setApprovingAll(true);
    setExceptionError(null);
    try {
      await apiFetch(`${API.drivers}/drivers/${driver.id}/approve`, {
        method: 'PUT',
        ...(reason ? { body: JSON.stringify({ reason }) } : {}),
      });
      setShowException(false);
      setAuditKey(k => k + 1);
      await load(driver.id);
      toast.success(reason ? 'Conductor aprobado por excepción. Tiene 3 días para completar sus documentos.' : 'Conductor aprobado.');
    } catch (e: any) {
      const msg = e.message ?? 'No se pudo aprobar el registro.';
      if (reason) setExceptionError(msg); else toast.error(msg);
    } finally { setApprovingAll(false); }
  }

  /* ── Rechazar / suspender / reactivar / mantener ─────────────────────
     Siempre con confirmación y motivo obligatorio (10-500). Tras cada acción
     se recarga el conductor y el historial. Lanza Error con el mensaje del backend. */
  async function statusAction(path: string, body: object, okMsg: (d: DriverDto) => string): Promise<void> {
    if (!driver) return;
    setStatusBusy(true);
    try {
      const updated = await apiFetch<DriverDto>(`${API.drivers}/drivers/admin/${driver.id}/${path}`, {
        method: 'POST', body: JSON.stringify(body),
      });
      toast.success(okMsg(updated));
      setAuditKey(k => k + 1);
      await refreshDriver(driver.id);
    } catch (e: any) {
      throw new Error(e instanceof ApiError ? e.message : (e?.message ?? 'No se pudo completar la acción.'));
    } finally { setStatusBusy(false); }
  }

  async function rejectDriver() {
    const res = await confirm({
      title: '¿Rechazar el registro de este conductor?',
      message: 'No podrá conectarse ni recibir viajes. Le llegará un aviso y un correo con el motivo, y podrá pedir una revisión.',
      tone: 'danger', confirmText: 'Rechazar conductor',
      reasonLabel: 'Motivo del rechazo', reasonPlaceholder: 'Ej.: Los antecedentes no cumplen los requisitos de Bugie.',
      ...REASON,
    });
    if (!res) return;
    try { await statusAction('reject', { reason: res.reason }, () => 'Registro rechazado. El conductor fue notificado.'); }
    catch (e: any) { toast.error(e.message); }
  }

  async function reactivateDriver() {
    const res = await confirm({
      title: '¿Reactivar a este conductor?',
      message: driver?.status === 5
        ? 'Su registro volverá a «En revisión» para que revises sus documentos. Le llegará un aviso y un correo.'
        : 'Volverá a su estado según sus documentos (aprobado si están completos). Le llegará un aviso y un correo.',
      tone: 'primary', confirmText: 'Reactivar',
      reasonLabel: 'Motivo de la reactivación', reasonPlaceholder: 'Ej.: Revisamos su caso y presentó sus descargos.',
      ...REASON,
    });
    if (!res) return;
    try {
      await statusAction('reactivate', { reason: res.reason }, d => {
        const label = DRIVER_STATUS[d.status]?.label ?? 'actualizado';
        const miss = d.missingDocuments?.length ? ` Le faltan: ${d.missingDocuments.map(k => driverDocMeta(k).label).join(', ')}.` : '';
        return `Conductor reactivado. Nuevo estado: ${label}.${miss}`;
      });
    } catch (e: any) { toast.error(e.message); }
  }

  async function keepDecision() {
    const suspended = driver?.status === 4;
    const res = await confirm({
      title: suspended ? '¿Mantener la suspensión?' : '¿Mantener el rechazo?',
      message: 'Se cerrará la solicitud de revisión y el conductor recibirá tu respuesta con el motivo. Su estado no cambia.',
      tone: 'warning', confirmText: suspended ? 'Mantener suspensión' : 'Mantener rechazo',
      reasonLabel: 'Respuesta para el conductor', reasonPlaceholder: 'Ej.: Los reclamos siguen sin resolverse.',
      ...REASON,
    });
    if (!res) return;
    try { await statusAction('review-request/keep', { reason: res.reason }, () => 'Solicitud respondida. El conductor fue notificado.'); }
    catch (e: any) { toast.error(e.message); }
  }

  async function suspendDriver(data: SuspendData) {
    const ok = await confirm({
      title: '¿Suspender a este conductor?',
      message: data.until
        ? `Quedará suspendido hasta el ${ymdToDisplay(data.until)} (inclusive) y se reactivará solo al terminar.`
        : 'Suspensión indefinida: seguirá suspendido hasta que lo reactives.',
      tone: 'danger', confirmText: 'Sí, suspender',
    });
    if (!ok) return;
    setSuspendError(null);
    try {
      await statusAction('suspend', { reason: data.reason, until: data.until }, () => 'Conductor suspendido. Fue notificado.');
      setShowSuspend(false);
    } catch (e: any) { setSuspendError(e.message); }
  }

  // Documentos obligatorios que faltan (el backend aplica la regla de la
  // revisión técnica según la antigüedad del vehículo).
  const requiredKeys = Object.keys(DRIVER_DOC_LABEL);
  const missing      = driver?.missingDocuments ?? [];
  const missingLabels = missing.map(k => driverDocMeta(k).label);
  const isComplete   = missing.length === 0;
  const strikes      = driver?.strikes ?? 0;
  // Con documentos completos, además el admin debe marcar el check de revisión.
  const allReviewed  = docs
    .filter(d => requiredKeys.includes(d.docType))
    .every(d => reviewed.has(d.id) || d.status !== 'pending');
  const alreadyApproved = driver?.status === 3;
  // Cuenta eliminada: no se aprueba, suspende, rechaza ni reactiva hasta restaurarla.
  const deletedAt    = driver?.deletedAt ?? userInfo?.deletedAt ?? null;
  const deletedReason = driver?.deletedReason ?? userInfo?.deletedReason ?? null;
  const isDeleted    = !!deletedAt;
  // Suspendido o rechazado: no se aprueba (el backend da 409), se usa «Reactivar».
  const blockedStatus = driver?.status === 4 || driver?.status === 5 || isDeleted;
  const canApprove   = !alreadyApproved && !blockedStatus && isComplete && allReviewed;
  // Sin documentos completos solo por excepción, y solo si no tiene faltas.
  const canException = !alreadyApproved && !blockedStatus && !isComplete && strikes === 0;
  const blockedByStrikes = !alreadyApproved && !blockedStatus && !isComplete && strikes > 0;
  const pendingDocs = docs.filter(d => d.status === 'pending').length;

  const back = { to: '/admin/conductores', label: 'Conductores' };

  if (loading) {
    return (
      <Page title="Cargando conductor…" back={back}>
        <SectionCard><Skeleton height={72} radius={12} /><div className="mt-3"><Skeleton count={4} /></div></SectionCard>
      </Page>
    );
  }
  if (error || !driver) {
    return (
      <Page title="Conductor" back={back}>
        <SectionCard>
          <EmptyState variant="error" title="No se pudo abrir el conductor" text={error ?? 'Conductor no encontrado.'}
            action={driverId && <button className="btn btn-sm btn-bugie" onClick={() => load(driverId)}>Reintentar</button>} />
        </SectionCard>
      </Page>
    );
  }

  const name = userInfo?.fullName ?? driver.fullName ?? `Conductor ${driver.userId.slice(0, 8)}…`;
  const toggleReviewed = (id: string) => setReviewed(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /* Botón de aprobación (misma regla de siempre):
     - documentos completos → aprobación normal (requiere revisar cada documento)
     - incompletos sin faltas → modal de excepción (motivo obligatorio, 3 días)
     - incompletos con faltas → deshabilitado */
  const approveButton = alreadyApproved || blockedStatus ? null : canException ? (
    <button className="btn btn-warning" disabled={approvingAll}
            onClick={() => { setExceptionError(null); setShowException(true); }}>
      <i className="fa-solid fa-triangle-exclamation me-2" aria-hidden="true" />Aprobar por excepción
    </button>
  ) : (
    <button className="btn btn-success" disabled={!canApprove || approvingAll} onClick={() => approveDriver()}>
      {approvingAll
        ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Aprobando…</>
        : <><i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Aprobar registro</>}
    </button>
  );

  const approvalCard = (
    <SectionCard
      title="Aprobación"
      icon="fa-user-check"
      tourId="driver-approval"
      description={isDeleted ? 'La cuenta está eliminada.'
        : alreadyApproved ? 'El conductor está aprobado.'
        : blockedStatus ? (driver.status === 4 ? 'La cuenta está suspendida.' : 'El registro fue rechazado.')
        : 'Qué falta para que pueda empezar a trabajar.'}
      footer={approveButton && <div className="d-flex flex-wrap gap-2 justify-content-end">{approveButton}</div>}
    >
      <div className="d-grid gap-3">
        {/* Plazo de documentos (aprobado por excepción) */}
        {driver.documentsDeadline && (
          <div className="alert alert-warning small mb-0 d-flex gap-2 align-items-start">
            <i className="fa-solid fa-hourglass-half mt-1" aria-hidden="true" />
            <div>
              <strong>Aprobado por excepción.</strong> Plazo para completar documentos: <strong>{fmtDateTime(driver.documentsDeadline)}</strong>.
              {missingLabels.length > 0 && <> Faltan: {missingLabels.join(', ')}.</>}
            </div>
          </div>
        )}
        {strikes > 0 && (
          <div className="alert alert-danger small mb-0 d-flex gap-2 align-items-start">
            <i className="fa-solid fa-ban mt-1" aria-hidden="true" />
            <div>
              Tiene <strong>{strikes} falta{strikes === 1 ? '' : 's'}</strong> por no completar documentos a tiempo.
              {blockedByStrikes && <> Ya no puede aprobarse por excepción: solo con documentos completos. Faltan: {missingLabels.join(', ')}.</>}
            </div>
          </div>
        )}

        {isDeleted ? (
          <p className="small bugie-muted mb-0">
            No se puede aprobar, suspender ni rechazar una cuenta eliminada. Restáurala primero con «Restaurar cuenta».
          </p>
        ) : blockedStatus ? (
          <p className="small bugie-muted mb-0">
            No se puede aprobar mientras esté {driver.status === 4 ? 'suspendido' : 'rechazado'}. Usa «Reactivar» arriba si corresponde.
          </p>
        ) : alreadyApproved ? (
          !driver.documentsDeadline && <EmptyState compact variant="done" title="Todo en orden" text={`Aprobado el ${fmtDate(driver.approvedAt)}.`} />
        ) : (
          <>
            <Checklist items={[
              { done: isComplete, label: isComplete ? 'Tiene todos los documentos obligatorios aprobados.' : `Faltan documentos: ${missingLabels.join(', ')}.` },
              { done: allReviewed, label: 'Marcaste «Revisado» en cada documento.' },
              ...(!isComplete ? [{ done: strikes === 0, label: 'No tiene faltas (requisito para aprobar por excepción).' }] : []),
            ]} />
            {canException && (
              <p className="small bugie-muted mb-0">
                Puedes aprobarlo por excepción con un motivo: tendrá <strong>3 días</strong> para completar sus documentos.
              </p>
            )}
            {isComplete && !allReviewed && (
              <p className="small bugie-muted mb-0">Ve a la pestaña «Documentos» y marca «Revisado» en cada uno para activar el botón.</p>
            )}
          </>
        )}
        {tab === 'resumen' && pendingDocs > 0 && (
          <button className="btn btn-sm btn-outline-secondary" style={{ justifySelf: 'start' }} onClick={() => setTab('documentos')}>
            <i className="fa-solid fa-folder-open me-2" aria-hidden="true" />
            Ir a revisar {pendingDocs} documento{pendingDocs === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </SectionCard>
  );

  return (
    <Page
      title={name}
      subtitle="Ficha del conductor"
      back={back}
      helpKey="driver-detail"
      actions={[
        { label: 'Reactivar', icon: 'fa-rotate-left', variant: 'primary', onClick: reactivateDriver,
          loading: statusBusy, hidden: !blockedStatus || isDeleted },
        { label: 'Suspender', icon: 'fa-ban', variant: 'danger',
          onClick: () => { setSuspendError(null); setShowSuspend(true); },
          disabled: statusBusy, hidden: driver.status !== 3 || isDeleted },
        { label: 'Rechazar conductor', icon: 'fa-circle-xmark', variant: 'danger', onClick: rejectDriver,
          loading: statusBusy, hidden: ![1, 2, 6].includes(driver.status) || isDeleted },
      ]}
      extra={
        <span className="d-inline-flex flex-wrap gap-2">
          {isDeleted && <StatusBadge tone="bad" icon="fa-user-xmark">Cuenta eliminada</StatusBadge>}
          <DriverStatusBadge status={driver.status} suspendedUntil={driver.suspendedUntil ?? null} />
          {!isDeleted && <StatusBadge tone={driver.isOnline ? 'ok' : 'neutral'} dot>{driver.isOnline ? 'En línea' : 'Desconectado'}</StatusBadge>}
          {!isDeleted && userInfo?.deactivatedAt && (
            <DeactivatedBadge deactivatedAt={userInfo.deactivatedAt} deactivatedReason={userInfo.deactivatedReason} />
          )}
          {userInfo?.needsProfileCompletion && <IncompleteBadge />}
        </span>
      }
    >
      {deletedAt && (
        <DeletedAccountBanner userId={driver.userId} deletedAt={deletedAt} deletedReason={deletedReason}
          onRestored={refreshAccount}
          note="Mientras esté eliminada no se puede aprobar, suspender, rechazar ni reactivar al conductor." />
      )}

      {(driver.status === 4 || driver.status === 5) && (
        <div className="d-grid gap-3 mb-3" data-tour="driver-status">
          <StatusBlock driver={driver} lastChange={lastChange} />
          {driver.openReviewRequest && !isDeleted && (
            <ReviewRequestCard
              request={driver.openReviewRequest}
              suspended={driver.status === 4}
              busy={statusBusy}
              onReactivate={reactivateDriver}
              onKeep={keepDecision}
            />
          )}
        </div>
      )}

      <div data-tour="driver-tabs">
        <Tabs items={[
          { value: 'resumen',        label: 'Resumen',        icon: 'fa-user' },
          { value: 'viajes',         label: 'Viajes',         icon: 'fa-route' },
          { value: 'documentos',     label: 'Documentos',     icon: 'fa-folder-open', count: pendingDocs || undefined },
          { value: 'vehiculos',      label: 'Vehículos',      icon: 'fa-car', count: vehicles.length || undefined },
          { value: 'calificaciones', label: 'Calificaciones', icon: 'fa-star' },
          { value: 'conexiones',     label: 'Conexiones',     icon: 'fa-plug' },
          { value: 'pagos',          label: 'Pagos',          icon: 'fa-money-bill-wave' },
          { value: 'notificaciones', label: 'Notificaciones', icon: 'fa-bell' },
          { value: 'historial',      label: 'Historial',      icon: 'fa-clock-rotate-left' },
        ]} />
      </div>

      {/* ── Resumen ───────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <div className="bx-split">
          <div className="d-grid gap-3">
            <SectionCard>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <Avatar src={fileUrl('drivers', driver.profilePhotoUrl)} name={name} size={80} />
                <div style={{ minWidth: 0 }}>
                  <div className="h5 fw-bold mb-1" style={{ overflowWrap: 'anywhere' }}>{name}</div>
                  <StarRating rating={driver.rating ?? 0} total={driver.totalRatings ?? 0} />
                </div>
              </div>
              <div className="mt-3">
                <InfoRow icon="fa-envelope" label="Correo">
                  {userInfo?.email ? <a href={`mailto:${userInfo.email}`}>{userInfo.email}</a> : '—'}
                </InfoRow>
                <InfoRow icon="fa-phone" label="Teléfono">
                  {userInfo?.phone ? <a href={`tel:${userInfo.phone}`}>{userInfo.phone}</a> : '—'}
                </InfoRow>
                <InfoRow icon="fa-calendar-plus" label="Registrado">{fmtDate(driver.createdAt)}</InfoRow>
                {driver.approvedAt && <InfoRow icon="fa-circle-check" label="Aprobado">{fmtDate(driver.approvedAt)}</InfoRow>}
              </div>
            </SectionCard>
            {userInfo && <IdentityCard userId={driver.userId} info={userInfo} onChanged={refreshAccount} />}
            {userInfo && <AccountAccessCard userId={driver.userId} info={userInfo} onChanged={refreshAccount} />}
            <EmergencyContactCard userId={driver.userId} />
          </div>

          <div className="d-grid gap-3">
            {approvalCard}
            <SectionCard title="Términos y firma" icon="fa-file-signature">
              <TermsBlock accepted={userInfo?.termsAccepted} signature={userInfo?.signatureImage} />
            </SectionCard>
            <SectionCard>
              <details>
                <summary className="fw-semibold" style={{ cursor: 'pointer' }}>
                  <i className="fa-solid fa-fingerprint me-2" aria-hidden="true" />Datos técnicos
                </summary>
                <p className="small bugie-muted mt-2 mb-1">Identificadores internos, útiles si soporte técnico te los pide.</p>
                <CopyRow label="ID del conductor" value={driver.id} />
                <CopyRow label="ID de usuario" value={driver.userId} />
              </details>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ── Documentos ────────────────────────────────────────────── */}
      {tab === 'documentos' && (
        <>
          <SectionCard
            title="Documentos"
            icon="fa-folder-open"
            description="Abre cada documento, apruébalo o recházalo y marca «Revisado»."
            actions={
              <button className="btn btn-sm btn-outline-secondary" onClick={loadHistory}>
                <i className="fa-solid fa-clock-rotate-left me-1" aria-hidden="true" />Histórico
              </button>
            }
            flush
            tourId="driver-docs"
          >
            {docs.length === 0 ? (
              <EmptyState title="Sin documentos" text="El conductor aún no ha subido documentos." icon="fa-folder-open" />
            ) : (
              <ul className="list-unstyled mb-0">
                {docs.map(doc => (
                  <DriverDocRow
                    key={doc.id}
                    doc={doc}
                    reviewed={reviewed.has(doc.id) || doc.status === 'approved'}
                    acting={actingDoc === doc.id}
                    onToggleReviewed={() => toggleReviewed(doc.id)}
                    onPreview={() => setPreview(doc)}
                    onApprove={() => approveDoc(doc)}
                    onReject={() => rejectDoc(doc)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
          {approvalCard}
        </>
      )}

      {/* ── Vehículos ─────────────────────────────────────────────── */}
      {tab === 'vehiculos' && (
        <SectionCard title="Vehículos" icon="fa-car" description="Los activos aparecen primero.">
          {vehicles.length === 0 ? (
            <EmptyState compact title="Sin vehículos" text="El conductor no tiene vehículos registrados." icon="fa-car" />
          ) : (
            <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))' }}>
              {[...vehicles]
                .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1))
                .map(v => <VehicleCard key={v.id} v={v} />)}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'viajes' && <UserTripsSection mode="driver" userId={driver.userId} />}
      {tab === 'calificaciones' && <DriverRatingsSection driverUserId={driver.userId} />}
      {tab === 'conexiones' && (
        <DriverPresenceSection driverId={driver.id} comparePhotos={[
          { label: 'Foto de perfil', src: fileUrl('drivers', driver.profilePhotoUrl) },
          docPhoto(docs, ['dni_front'], 'DNI - Frontal'),
          docPhoto(docs, ['license'], 'Licencia de conducir'),
        ]} />
      )}
      {tab === 'pagos' && <DriverPayoutsSection driverUserId={driver.userId} />}
      {tab === 'notificaciones' && <UserNotifications userId={driver.userId} who="conductor" />}
      {tab === 'historial' && <DriverTimeline driverId={driver.id} userId={driver.userId} reloadKey={auditKey} />}

      {/* Suspender: motivo + duración; la confirmación final la pide suspendDriver */}
      {showSuspend && (
        <DriverSuspendModal
          driverName={name}
          submitting={statusBusy}
          error={suspendError}
          onSubmit={suspendDriver}
          onClose={() => setShowSuspend(false)}
        />
      )}

      {/* Aprobación por excepción (motivo obligatorio) */}
      {showException && (
        <DriverApprovalModal
          missingLabels={missingLabels}
          submitting={approvingAll}
          error={exceptionError}
          onConfirm={(reason) => approveDriver(reason)}
          onClose={() => setShowException(false)}
        />
      )}

      <DocPreviewModal
        doc={preview}
        label={preview ? driverDocMeta(preview.docType).label : ''}
        icon={preview ? driverDocMeta(preview.docType).icon : undefined}
        service="drivers"
        downloadUrl={preview ? `${API.drivers}/drivers/documents/${preview.id}/download` : undefined}
        onClose={() => setPreview(null)}
        footerExtra={preview && preview.status === 'pending' && (
          <button className="btn btn-sm btn-success" disabled={actingDoc === preview.id}
                  onClick={() => { const d = preview; setPreview(null); approveDoc(d); }}>
            <i className="fa-solid fa-check me-1" aria-hidden="true" />Aprobar
          </button>
        )}
      />

      {/* Histórico de documentos reemplazados */}
      <Drawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Histórico de documentos"
        description="Archivos antiguos reemplazados por uno nuevo. El conductor ya no los ve."
      >
        {historyLoading ? (
          <Skeleton count={3} height={48} radius={10} />
        ) : historyError ? (
          <EmptyState compact variant="error" title="No se pudo cargar" text={historyError} />
        ) : history.length === 0 ? (
          <EmptyState compact title="Sin documentos antiguos" icon="fa-folder-open" />
        ) : (
          <ul className="list-unstyled d-grid gap-2 mb-0">
            {[...history]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map(doc => {
                const meta = driverDocMeta(doc.docType);
                return (
                  <li key={doc.id} className="p-3 rounded-3 d-flex flex-wrap align-items-center gap-2"
                      style={{ background: 'var(--bugie-surface-2)' }}>
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <div className="fw-semibold small">{meta.label}</div>
                      <div className="small bugie-muted text-truncate">{doc.originalFileName ?? 'archivo'}</div>
                      <div className="small bugie-muted">
                        Subido {fmtDate(doc.createdAt)}{doc.expiresAt && <> · vencía {fmtDate(doc.expiresAt)}</>}
                      </div>
                    </div>
                    <DocStatusBadge status={doc.status} />
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setHistoryPreview(doc)}>
                      <i className="fa-solid fa-eye me-1" aria-hidden="true" />Ver
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </Drawer>

      <DocPreviewModal
        doc={historyPreview}
        label={historyPreview ? `${driverDocMeta(historyPreview.docType).label} (antiguo)` : ''}
        service="drivers"
        downloadUrl={historyPreview ? `${API.drivers}/drivers/documents/${historyPreview.id}/download` : undefined}
        onClose={() => setHistoryPreview(null)}
      />

    </Page>
  );
}

/// Estado de suspensión / rechazo: motivo, hasta cuándo y quién lo decidió.
function StatusBlock({ driver, lastChange }: { driver: DriverDto; lastChange: { at: string | null; by: string | null } }) {
  const suspended = driver.status === 4;
  return (
    <SectionCard
      icon={suspended ? 'fa-ban' : 'fa-circle-xmark'}
      title={suspended ? 'Cuenta suspendida' : 'Registro rechazado'}
      actions={<DriverStatusBadge status={driver.status} suspendedUntil={driver.suspendedUntil ?? null} />}
    >
      <InfoRow icon="fa-comment" label="Motivo">
        <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{driver.statusReason || '—'}</span>
      </InfoRow>
      {suspended && (
        <InfoRow icon="fa-calendar-day" label="Duración">
          {driver.suspendedUntil ? `Hasta el ${fmtDay(driver.suspendedUntil)} (inclusive)` : 'Indefinida'}
        </InfoRow>
      )}
      {(lastChange.by || lastChange.at) && (
        <InfoRow icon="fa-user-shield" label="Decidido por">
          {lastChange.by ?? '—'}{lastChange.at && <span className="bugie-muted"> · {fmtDateTime(lastChange.at)}</span>}
        </InfoRow>
      )}
    </SectionCard>
  );
}

/// Solicitud de revisión abierta del conductor: reactivar o mantener la decisión.
function ReviewRequestCard({ request, suspended, busy, onReactivate, onKeep }: {
  request: { id: string; message: string; createdAt: string };
  suspended: boolean; busy: boolean;
  onReactivate: () => void; onKeep: () => void;
}) {
  return (
    <div className="alert alert-warning mb-0">
      <div className="d-flex align-items-start gap-3 flex-wrap">
        <span className="bx-stat-icon bx-tone-warn" aria-hidden="true"><i className="fa-solid fa-envelope-open-text" /></span>
        <div className="flex-grow-1" style={{ minWidth: 0, flexBasis: 240 }}>
          <div className="fw-bold">Solicitud de revisión</div>
          <div className="small">Enviada el {fmtDateTime(request.createdAt)}</div>
          <blockquote className="small mt-2 mb-0 p-2 rounded-2" style={{ background: 'var(--bugie-surface)', overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            «{request.message}»
          </blockquote>
        </div>
      </div>
      <div className="d-flex flex-wrap gap-2 justify-content-end mt-3">
        <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={onKeep}>
          <i className="fa-solid fa-gavel me-1" aria-hidden="true" />{suspended ? 'Mantener suspensión' : 'Mantener rechazo'}
        </button>
        <button className="btn btn-sm btn-bugie" disabled={busy} onClick={onReactivate}>
          <i className="fa-solid fa-rotate-left me-1" aria-hidden="true" />Reactivar
        </button>
      </div>
    </div>
  );
}

/// Foto de un documento del conductor para comparar con la selfie (solo si es imagen
/// y no fue reemplazado). Sin documento o en PDF queda el hueco "Sin foto".
function docPhoto(docs: Doc[], types: string[], label: string) {
  const doc = docs.find(d => types.includes(d.docType) && d.status !== 'superseded' && !!d.mimeType?.startsWith('image/'));
  return { label, src: doc ? fileUrl('drivers', doc.fileUrl) : null };
}

/// Fila de documento: estado en español, vencimiento, check de revisado y acciones con texto.
function DriverDocRow({ doc, reviewed, acting, onToggleReviewed, onPreview, onApprove, onReject }: {
  doc: Doc; reviewed: boolean; acting: boolean;
  onToggleReviewed: () => void; onPreview: () => void; onApprove: () => void; onReject: () => void;
}) {
  const meta = driverDocMeta(doc.docType);
  const expired = !!doc.expiresAt && new Date(doc.expiresAt) <= new Date();
  const checkId = `rev-${doc.id}`;
  return (
    <li className="d-flex flex-wrap align-items-center gap-3 p-3" style={{ borderTop: '1px solid var(--bugie-border)' }}>
      <div className="d-flex align-items-center gap-3 flex-grow-1" style={{ minWidth: 0, flexBasis: 240 }}>
        <span className="bx-stat-icon bx-tone-primary" aria-hidden="true"><i className={`fa-solid ${meta.icon}`} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold d-flex flex-wrap align-items-center gap-2">{meta.label} <DocStatusBadge status={doc.status} /></div>
          <div className="small bugie-muted text-truncate">{doc.originalFileName ?? 'archivo'}</div>
          {doc.expiresAt && (
            <div className={`small ${expired ? 'text-danger fw-semibold' : 'bugie-muted'}`}>
              <i className="fa-solid fa-calendar-day me-1" aria-hidden="true" />
              {expired ? 'Vencido el ' : 'Vence el '}{fmtDate(doc.expiresAt)}
            </div>
          )}
          {doc.rejectionReason && <div className="small text-danger">Motivo: {doc.rejectionReason}</div>}
        </div>
      </div>
      <Checkbox id={checkId} size="sm" checked={reviewed} onChange={() => onToggleReviewed()} label="Revisado" />
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={onPreview}>
          <i className="fa-solid fa-eye me-1" aria-hidden="true" />Ver
        </button>
        <button className="btn btn-sm btn-success" disabled={acting || doc.status === 'approved'} onClick={onApprove}>
          {acting ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" /> : <i className="fa-solid fa-check me-1" aria-hidden="true" />}
          Aprobar
        </button>
        <button className="btn btn-sm btn-outline-danger" disabled={acting} onClick={onReject}>
          <i className="fa-solid fa-xmark me-1" aria-hidden="true" />Rechazar
        </button>
      </div>
    </li>
  );
}

// Fotos del vehículo: frente, costado y placa (GET /drivers/vehicles/{id}/photos).
interface VehiclePhoto { type: 'front' | 'side' | 'plate'; url: string; updatedAt: string; }
const VEHICLE_PHOTO_TYPES: Array<{ type: VehiclePhoto['type']; label: string }> = [
  { type: 'front', label: 'Frente' },
  { type: 'side',  label: 'Costado' },
  { type: 'plate', label: 'Placa' },
];

function VehicleCard({ v }: { v: Vehicle }) {
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  useEffect(() => {
    let alive = true;
    apiFetch<VehiclePhoto[]>(`${API.drivers}/drivers/vehicles/${v.id}/photos`)
      .then(list => { if (alive) setPhotos(list ?? []); })
      .catch(() => { if (alive) setPhotos([]); });
    return () => { alive = false; };
  }, [v.id]);

  // La foto de frente; si no hay registro, la photoUrl de siempre.
  const urlOf = (type: VehiclePhoto['type']) =>
    fileUrl('drivers', photos.find(p => p.type === type)?.url ?? (type === 'front' ? v.photoUrl : null));
  const photo = urlOf('front');
  return (
    <div className="rounded-3 overflow-hidden" style={{ border: '1px solid var(--bugie-border)', opacity: v.isActive ? 1 : 0.65 }}>
      {photo ? (
        <img src={photo} alt={`Vehículo ${v.plate}`}
             style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', filter: v.isActive ? 'none' : 'grayscale(60%)' }} />
      ) : (
        <div className="d-flex align-items-center justify-content-center" style={{ aspectRatio: '16 / 9', background: 'var(--bugie-bg-2)' }}>
          <i className="fa-solid fa-car fa-2x bugie-muted" aria-hidden="true" />
        </div>
      )}
      <div className="p-3">
        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <span className="fw-bold">{v.plate}</span>
          <StatusBadge tone={v.isActive ? 'ok' : 'neutral'} size="sm">{v.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
        </div>
        <div className="small">{v.brand} {v.model}</div>
        <div className="small bugie-muted">{v.year} · {v.color}</div>
        <div className="d-grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {VEHICLE_PHOTO_TYPES.map(pt => {
            const src = urlOf(pt.type);
            return (
              <div key={pt.type} className="text-center">
                {src ? (
                  <a href={src} target="_blank" rel="noreferrer" title={`Ver foto: ${pt.label}`}>
                    <img src={src} alt={`${pt.label} del vehículo ${v.plate}`}
                         style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 6, display: 'block', border: '1px solid var(--bugie-border)' }} />
                  </a>
                ) : (
                  <div className="d-flex align-items-center justify-content-center small bugie-muted"
                       style={{ aspectRatio: '4 / 3', borderRadius: 6, background: 'var(--bugie-bg-2)' }}>
                    Sin foto
                  </div>
                )}
                <div className="small bugie-muted mt-1">{pt.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Calificaciones recibidas (10 por página, botón "Cargar más").
// El promedio lo trae driver.rating; aquí solo se listan las individuales.
// ─────────────────────────────────────────────────────────────────────
interface AdminRating {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  driverId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}
interface AdminRatingPage {
  items: AdminRating[];
  page: number;
  pageSize: number;
  total: number;
}

function DriverRatingsSection({ driverUserId }: { driverUserId: string }) {
  const PAGE_SIZE = 10;
  const [items, setItems]     = useState<AdminRating[]>([]);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [initial, setInitial] = useState(true);

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const p = reset ? 1 : page;
      const data = await apiFetch<AdminRatingPage>(
        `${API.trips}/trips/ratings/driver/${driverUserId}?page=${p}&pageSize=${PAGE_SIZE}`);
      setItems(prev => reset ? data.items : [...prev, ...data.items]);
      setPage(p + 1);
      setTotal(data.total);
      setHasMore(p * data.pageSize < data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las calificaciones.');
    } finally {
      setLoading(false);
      setInitial(false);
    }
  }

  useEffect(() => {
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverUserId]);

  return (
    <SectionCard
      title="Calificaciones recibidas"
      icon="fa-star"
      actions={!initial && <StatusBadge tone="neutral">{total} en total</StatusBadge>}
    >
      {error && <div className="alert alert-danger small mb-2">{error}</div>}

      {initial ? (
        <Skeleton count={3} height={56} radius={10} />
      ) : items.length === 0 ? (
        <EmptyState compact title="Sin calificaciones" text="Este conductor aún no tiene calificaciones." icon="fa-star" />
      ) : (
        <div className="d-grid gap-2">
          {items.map(r => <AdminRatingCard key={r.id} rating={r} />)}
          {hasMore && (
            <button onClick={() => loadPage(false)} disabled={loading} className="btn btn-sm btn-outline-secondary mt-2">
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Cargando…</>
                : `Cargar más (${items.length} de ${total})`}
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function AdminRatingCard({ rating }: { rating: AdminRating }) {
  return (
    <div className="p-3 rounded-3" style={{ background: 'var(--bugie-surface-2)' }}>
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span className="d-inline-flex" aria-label={`${rating.stars} de 5 estrellas`}>
          {[1, 2, 3, 4, 5].map(s => (
            <i key={s} className="fa-solid fa-star" aria-hidden="true"
               style={{ color: s <= rating.stars ? 'var(--bugie-warn)' : 'var(--bugie-border)', fontSize: '.85rem', marginRight: 1 }} />
          ))}
        </span>
        <span className="fw-bold small">{rating.stars}/5</span>
        <span className="ms-auto small bugie-muted">{fmtDateTime(rating.createdAt)}</span>
      </div>
      <div className="small">
        <i className="fa-solid fa-user me-1 bugie-muted" aria-hidden="true" />{rating.passengerName}
      </div>
      {rating.comment && (
        <blockquote className="small mt-2 mb-0 p-2 rounded-2 fst-italic" style={{ background: 'var(--bugie-bg-2)' }}>
          «{rating.comment}»
        </blockquote>
      )}
    </div>
  );
}
