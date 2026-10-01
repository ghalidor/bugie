import { useState } from 'react';

/**
 * Libro de Reclamaciones — formato Indecopi adaptado al diseño Bugie.
 *
 * Estado: SOLO UI. No envía nada al backend todavía.
 * El botón "Enviar" muestra un alert. La integración real se hará después.
 *
 * Se abre en pestaña independiente desde el footer (target="_blank").
 */
export default function ComplaintsBook() {
  const today = new Date().toLocaleDateString('es-PE');

  // Estado mínimo del formulario, todo string por ahora
  const [form, setForm] = useState({
    nombre: '', domicilio: '', dni: '', telefono: '',
    email: '', emailConfirm: '',
    tipoBien: 'producto', // producto | servicio
    montoReclamado: '', descripcion: '',
    tipoReclamo: 'reclamo', // reclamo | queja
    referencia: '', detalle: '', pedido: '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: enviar al backend cuando esté listo
    alert('Formulario recibido. La integración con el backend se implementará próximamente.');
  }

  return (
    <div style={{ background: 'var(--bugie-bg)', minHeight: '100vh', padding: '2rem 1rem' }}>
      <div className="container" style={{ maxWidth: 1100 }}>
        <div className="bugie-card p-4 p-md-5">

          {/* Encabezado */}
          <div className="row align-items-center mb-4">
            <div className="col-md-3 text-center mb-3 mb-md-0">
              <div
                className="bugie-brand mx-auto d-flex align-items-center justify-content-center"
                style={{
                  width: 110, height: 110, borderRadius: '50%',
                  background: 'var(--bugie-surface-2)',
                  border: '2px solid var(--bugie-border)',
                  fontSize: 28, fontWeight: 900,
                }}
              >
                Bugie
              </div>
            </div>
            <div className="col-md-9">
              <h1 className="bugie-h2 mb-2">Libro de Reclamaciones</h1>
              <p className="small bugie-muted mb-1">Fecha: {today}</p>
              <p className="small mb-0"><strong>InteliaDevs S.A.C.</strong></p>
              <p className="small bugie-muted mb-0">Trujillo, Perú</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>

            {/* 1. Identificación del consumidor */}
            <h5 className="fw-bold mt-4 mb-3">1. Identificación del consumidor reclamante</h5>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small">Nombre completo *</label>
                <input
                  className="form-control" required
                  value={form.nombre}
                  onChange={e => set('nombre', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Domicilio *</label>
                <input
                  className="form-control" required
                  value={form.domicilio}
                  onChange={e => set('domicilio', e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">DNI / CE *</label>
                <input
                  className="form-control" required
                  value={form.dni}
                  onChange={e => set('dni', e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Teléfono</label>
                <input
                  className="form-control"
                  value={form.telefono}
                  onChange={e => set('telefono', e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">E-mail *</label>
                <input
                  type="email" className="form-control" required
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Confirmar e-mail *</label>
                <input
                  type="email" className="form-control" required
                  value={form.emailConfirm}
                  onChange={e => set('emailConfirm', e.target.value)}
                />
              </div>
            </div>

            {/* 2. Identificación del bien */}
            <h5 className="fw-bold mt-4 mb-3">2. Identificación del bien contratado *</h5>
            <div className="d-flex gap-4 mb-3">
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio" name="tipoBien" value="producto"
                  checked={form.tipoBien === 'producto'}
                  onChange={e => set('tipoBien', e.target.value)}
                />
                Producto
              </label>
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio" name="tipoBien" value="servicio"
                  checked={form.tipoBien === 'servicio'}
                  onChange={e => set('tipoBien', e.target.value)}
                />
                Servicio
              </label>
            </div>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small">Monto reclamado (S/)</label>
                <input
                  className="form-control" type="number" step="0.01"
                  value={form.montoReclamado}
                  onChange={e => set('montoReclamado', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Descripción</label>
                <input
                  className="form-control"
                  value={form.descripcion}
                  onChange={e => set('descripcion', e.target.value)}
                />
              </div>
            </div>

            {/* 3. Detalle de la reclamación */}
            <h5 className="fw-bold mt-4 mb-3">3. Detalle de la reclamación</h5>
            <div className="d-flex gap-4 mb-3">
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio" name="tipoReclamo" value="reclamo"
                  checked={form.tipoReclamo === 'reclamo'}
                  onChange={e => set('tipoReclamo', e.target.value)}
                />
                Reclamo <sup>(1)</sup>
              </label>
              <label className="d-flex align-items-center gap-2">
                <input
                  type="radio" name="tipoReclamo" value="queja"
                  checked={form.tipoReclamo === 'queja'}
                  onChange={e => set('tipoReclamo', e.target.value)}
                />
                Queja <sup>(2)</sup>
              </label>
            </div>
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small">Referencia (ID viaje, nº de ticket u otro)</label>
                <input
                  className="form-control"
                  value={form.referencia}
                  onChange={e => set('referencia', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Detalle *</label>
                <textarea
                  className="form-control" rows={5} required
                  value={form.detalle}
                  onChange={e => set('detalle', e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Pedido *</label>
                <textarea
                  className="form-control" rows={5} required
                  value={form.pedido}
                  onChange={e => set('pedido', e.target.value)}
                />
              </div>
            </div>

            {/* Notas legales */}
            <div className="small bugie-muted mt-4">
              <p className="mb-1"><sup>(1)</sup> <strong>Reclamo:</strong> disconformidad relacionada a los productos o servicios.</p>
              <p className="mb-1"><sup>(2)</sup> <strong>Queja:</strong> disconformidad no relacionada a los productos o servicios, malestar respecto a la atención al público.</p>
              <p className="mb-0"><sup>(3)</sup> <strong>E-mail:</strong> al brindar mi correo electrónico, autorizo recibir la respuesta a través de este medio.</p>
              <ul className="mt-2 mb-0">
                <li>La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante INDECOPI.</li>
                <li>El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor de quince (15) días hábiles, improrrogable.</li>
              </ul>
            </div>

            {/* Botón enviar */}
            <div className="d-flex justify-content-end mt-4">
              <button
                type="submit"
                className="btn btn-bugie text-white px-4"
                style={{ background: '#dc3545', borderColor: '#dc3545' }}
              >
                <i className="fa-solid fa-paper-plane me-2" />
                Enviar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}