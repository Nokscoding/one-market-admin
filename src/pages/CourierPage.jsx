import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bike, CheckCircle2, ClipboardCopy, Clock3, LogOut, MapPin,
  MessageCircle, Navigation, PackageCheck, Phone, Plus, RefreshCw, ShieldCheck,
  Store, Truck, WalletCards,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime, usd } from '../lib/format'
import { adminUserError, logAdminError } from '../lib/userErrors'
import { Badge, ConfirmModal, Empty, Loader, SectionHead, Table } from '../components/UI'

const DELIVERY_LABELS = {
  assigned: 'Assignée',
  accepted: 'Acceptée',
  picking_up: 'Récupération',
  picked_up: 'Récupérée',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  problem: 'Problème',
  cancelled: 'Annulée',
}

const INCIDENT_LABELS = {
  client_absent: 'Client absent',
  client_unreachable: 'Client injoignable',
  payment_refused: 'Paiement refusé',
  address_issue: 'Problème d’adresse',
  store_issue: 'Problème chez la boutique',
  vehicle_issue: 'Problème véhicule',
  damaged_order: 'Commande endommagée',
  other: 'Autre',
}

function digits(value) {
  let out = String(value || '').replace(/\D/g, '')
  if (out.startsWith('0')) out = `243${out.slice(1)}`
  return out
}

function addressText(value = {}) {
  return [
    value.address_line,
    value.address_line1,
    value.building,
    value.apartment,
    value.district,
    value.commune,
    value.city,
    value.landmark,
  ].filter(Boolean).join(', ')
}

function mapsUrl(value = {}) {
  const lat = Number(value.latitude)
  const lng = Number(value.longitude)
  const query = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat},${lng}`
    : addressText(value)
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : ''
}

function primaryAction(status) {
  return {
    assigned: ['accept', 'Accepter la livraison'],
    accepted: ['start_pickup', 'Partir récupérer'],
    picking_up: ['picked_up', 'Commande récupérée'],
    picked_up: ['out_for_delivery', 'Mettre en livraison'],
    out_for_delivery: ['delivered', 'Marquer livrée'],
    problem: ['resume', 'Reprendre la livraison'],
  }[status] || null
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint32Array(14)
  window.crypto.getRandomValues(bytes)
  const body = Array.from(bytes, value => chars[value % chars.length]).join('')
  return `OM-${body}-9!`
}

export function CouriersPage() {
  const { staff } = useAuth()
  const isSuper = staff?.staff_role === 'SUPER_ADMIN'
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    vehicle_type: 'moto',
    vehicle_label: '',
    temporary_password: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.rpc('erp_list_couriers')
    if (loadError) {
      logAdminError('couriers-list', loadError)
      setError(adminUserError(loadError, 'Impossible de charger les livreurs.'))
      setCouriers([])
    } else {
      setCouriers(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setError('')
    setNotice('')
    setCreatedCredentials(null)
    setForm({
      full_name: '',
      email: '',
      phone: '',
      vehicle_type: 'moto',
      vehicle_label: '',
      temporary_password: generatePassword(),
    })
    setCreateOpen(true)
  }

  async function createCourier() {
    if (!form.full_name.trim() || !form.email.trim() || form.temporary_password.length < 10) {
      return setError('Nom, email et mot de passe temporaire sont obligatoires.')
    }
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: invokeError } = await supabase.functions.invoke('erp-create-courier', {
      body: {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        vehicle_type: form.vehicle_type,
        vehicle_label: form.vehicle_label.trim(),
        temporary_password: form.temporary_password,
      },
    })
    setBusy(false)

    if (invokeError || !data?.ok) {
      const code = data?.error || invokeError?.message || 'CREATE_FAILED'
      const friendly = code === 'EMAIL_ALREADY_EXISTS'
        ? 'Cet email possède déjà un compte. Utilisez plutôt la gestion des employés pour lui attribuer le rôle Livreur.'
        : code === 'ERP_SUPER_ADMIN_ONLY'
          ? 'Seul le DG / Super Admin peut créer un compte livreur.'
          : 'Impossible de créer le compte livreur.'
      return setError(friendly)
    }

    setCreatedCredentials({
      email: form.email.trim(),
      password: form.temporary_password,
      employee_code: data.courier?.employee_code || '',
    })
    setCreateOpen(false)
    setNotice('Compte livreur créé. Transmettez les identifiants au livreur de façon privée et demandez-lui de changer son mot de passe.')
    await load()
  }

  async function toggleCourier(row) {
    setError('')
    const next = row.status === 'active' ? 'suspended' : 'active'
    const { error: updateError } = await supabase.rpc('erp_set_courier_status', {
      p_user_id: row.user_id,
      p_status: next,
      p_available: next === 'active',
    })
    if (updateError) {
      logAdminError('courier-status', updateError)
      return setError(adminUserError(updateError, 'Impossible de modifier le statut du livreur.'))
    }
    await load()
  }

  async function copyCredentials() {
    if (!createdCredentials) return
    const text = `One Market Livreur\nEmail : ${createdCredentials.email}\nMot de passe temporaire : ${createdCredentials.password}`
    await navigator.clipboard?.writeText(text)
    setNotice('Identifiants copiés.')
  }

  return <>
    <SectionHead
      eyebrow="Opérations"
      title="Livreurs One Market"
      desc="Comptes livreurs recrutés par NKS, disponibilité et activité de livraison."
      actions={isSuper && <button className="btn primary" type="button" onClick={openCreate}><Plus size={17}/>Créer un livreur</button>}
    />
    {error && <div className="alert bad">{error}</div>}
    {notice && <div className="alert good">{notice}</div>}

    {createdCredentials && <section className="panel courier-credential-panel">
      <div>
        <strong>Identifiants temporaires</strong>
        <span>{createdCredentials.email}</span>
        <small>{createdCredentials.employee_code || 'Compte livreur actif'}</small>
      </div>
      <button className="btn ghost" type="button" onClick={copyCredentials}><ClipboardCopy size={16}/>Copier</button>
    </section>}

    {loading ? <Loader/> : couriers.length ? <Table
      headers={['Livreur','Contact','Véhicule','Courses actives','Statut','Dernière connexion','']}
      rows={couriers.map(row => [
        <div><strong>{row.full_name}</strong><span>{row.employee_code}</span></div>,
        <div><strong>{row.phone || '—'}</strong><span>{row.email || '—'}</span></div>,
        <div><strong>{row.vehicle_type || '—'}</strong><span>{row.vehicle_label || '—'}</span></div>,
        row.active_assignments || 0,
        <Badge value={row.status}/>,
        dateTime(row.last_login_at),
        <button className={`row-action ${row.status === 'active' ? 'danger-text' : ''}`} type="button" onClick={() => toggleCourier(row)}>
          {row.status === 'active' ? 'Suspendre' : 'Réactiver'}
        </button>,
      ])}
    /> : <Empty>Aucun livreur créé pour le moment.</Empty>}

    <ConfirmModal
      open={createOpen}
      title="Créer un compte livreur"
      text="Le livreur est recruté par NKS et recevra un accès limité à son espace mobile."
      onClose={() => setCreateOpen(false)}
      onConfirm={createCourier}
    >
      <div className="form-grid">
        <label>Nom complet<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
        <label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Téléphone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Véhicule<select value={form.vehicle_type} onChange={e=>setForm({...form,vehicle_type:e.target.value})}><option value="moto">Moto</option><option value="voiture">Voiture</option><option value="velo">Vélo</option><option value="pied">À pied</option><option value="autre">Autre</option></select></label>
        <label className="wide">Référence véhicule<input value={form.vehicle_label} onChange={e=>setForm({...form,vehicle_label:e.target.value})} placeholder="Ex. Moto Haojue noire · plaque…"/></label>
        <label className="wide">Mot de passe temporaire<input value={form.temporary_password} onChange={e=>setForm({...form,temporary_password:e.target.value})}/></label>
      </div>
      {busy && <div className="alert">Création du compte…</div>}
    </ConfirmModal>
  </>
}

export default function CourierPage() {
  const { staff, signOut } = useAuth()
  const [deliveries, setDeliveries] = useState([])
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('active')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [incident, setIncident] = useState(null)
  const [incidentForm, setIncidentForm] = useState({ type: 'client_unreachable', description: '' })

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    const [deliveriesResult, profileResult] = await Promise.all([
      supabase.rpc('courier_my_deliveries'),
      supabase.from('courier_profiles').select('employee_code,phone,vehicle_type,vehicle_label,status,is_available').maybeSingle(),
    ])
    if (deliveriesResult.error) {
      logAdminError('courier-deliveries', deliveriesResult.error)
      setError('Impossible de charger vos livraisons.')
    } else {
      setDeliveries(deliveriesResult.data || [])
    }
    if (!profileResult.error) setProfile(profileResult.data || null)
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load({ silent: true }), 25000)
    return () => window.clearInterval(timer)
  }, [load])

  const visible = useMemo(() => deliveries.filter(item => {
    if (tab === 'history') return item.assignment_status === 'delivered'
    if (tab === 'problems') return item.assignment_status === 'problem'
    return !['delivered','cancelled','problem'].includes(item.assignment_status)
  }), [deliveries, tab])

  const activeCount = deliveries.filter(item => !['delivered','cancelled','problem'].includes(item.assignment_status)).length
  const problemCount = deliveries.filter(item => item.assignment_status === 'problem').length

  async function runAction(item, action) {
    if (busy) return
    if (action === 'delivered') {
      const ok = window.confirm(
        `Confirmez que ${item.order_number} a été remise au client et que le paiement à la livraison a bien été encaissé.`
      )
      if (!ok) return
    }
    setBusy(item.assignment_id)
    setError('')
    const { error: actionError } = await supabase.rpc('courier_delivery_action', {
      p_assignment_id: item.assignment_id,
      p_action: action,
    })
    setBusy('')
    if (actionError) {
      logAdminError('courier-action', actionError)
      const message = actionError.message?.includes('ORDER_NOT_READY')
        ? 'Toutes les boutiques n’ont pas encore marqué leurs articles comme prêts.'
        : 'Impossible de mettre à jour cette livraison.'
      return setError(message)
    }
    await load({ silent: true })
  }

  function openIncident(item) {
    setIncident(item)
    setIncidentForm({ type: 'client_unreachable', description: '' })
  }

  async function submitIncident(event) {
    event.preventDefault()
    if (!incident || incidentForm.description.trim().length < 4) return
    setBusy(incident.assignment_id)
    setError('')
    const { error: incidentError } = await supabase.rpc('courier_report_problem', {
      p_assignment_id: incident.assignment_id,
      p_incident_type: incidentForm.type,
      p_description: incidentForm.description.trim(),
    })
    setBusy('')
    if (incidentError) {
      logAdminError('courier-incident', incidentError)
      return setError('Impossible d’envoyer le signalement.')
    }
    setIncident(null)
    await load({ silent: true })
  }

  if (loading) return <Loader fullscreen/>

  return <main className="courier-app">
    <header className="courier-header">
      <div className="courier-brand"><span>OM</span><div><strong>One Market Livreur</strong><small>{profile?.employee_code || 'Espace mobile'}</small></div></div>
      <button type="button" onClick={signOut} aria-label="Se déconnecter"><LogOut size={20}/></button>
    </header>

    <section className="courier-hero">
      <div><span>Bonjour</span><h1>{staff?.full_name || 'Livreur One Market'}</h1><p>{profile?.vehicle_type ? `${profile.vehicle_type}${profile.vehicle_label ? ` · ${profile.vehicle_label}` : ''}` : 'Équipe livraison NKS'}</p></div>
      <button type="button" onClick={() => load()}><RefreshCw size={18}/>Actualiser</button>
    </section>

    {error && <div className="courier-alert"><AlertTriangle size={18}/><span>{error}</span></div>}

    <nav className="courier-tabs">
      <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>À faire <b>{activeCount}</b></button>
      <button className={tab === 'problems' ? 'active' : ''} onClick={() => setTab('problems')}>Problèmes {problemCount > 0 && <b>{problemCount}</b>}</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Historique</button>
    </nav>

    <section className="courier-list">
      {visible.length ? visible.map(item => {
        const action = primaryAction(item.assignment_status)
        const shipping = item.shipping || {}
        const customerMap = mapsUrl(shipping)
        const customerPhone = shipping.phone || ''
        const wa = digits(shipping.whatsapp_phone || customerPhone)
        return <article className={`courier-task ${item.assignment_status === 'problem' ? 'is-problem' : ''}`} key={item.assignment_id}>
          <header className="courier-task-head">
            <div><span>{item.order_number}</span><strong>{DELIVERY_LABELS[item.assignment_status] || item.assignment_status}</strong><small>{item.delivery_method === 'express' ? 'Livraison express' : 'Livraison normale'} · {dateTime(item.assigned_at)}</small></div>
            <div className="courier-task-money"><b>{usd(item.items_total_usd)}</b><small>+ {cdf(item.delivery_fee_cdf)} livraison</small></div>
          </header>

          <section className="courier-step-block">
            <div className="courier-block-title"><Store size={18}/><span><strong>Récupération</strong><small>{(item.pickups || []).length} boutique{(item.pickups || []).length > 1 ? 's' : ''}</small></span></div>
            <div className="courier-pickups">{(item.pickups || []).map(pickup => {
              const pickupMap = mapsUrl(pickup)
              return <div className="courier-pickup" key={pickup.seller_order_id}>
                <div><strong>{pickup.store_name}</strong><span>{pickup.contact_name || 'Contact boutique'}</span><small>{addressText(pickup) || 'Adresse de retrait à compléter par NKS'}</small>{pickup.instructions && <small className="note">{pickup.instructions}</small>}</div>
                <div className="courier-mini-actions">
                  {pickup.phone && <a href={`tel:${pickup.phone}`}><Phone size={16}/></a>}
                  {pickupMap && <a href={pickupMap} target="_blank" rel="noreferrer"><Navigation size={16}/></a>}
                </div>
              </div>
            })}</div>
          </section>

          <section className="courier-step-block client">
            <div className="courier-block-title"><MapPin size={18}/><span><strong>Client</strong><small>{shipping.full_name || 'Client One Market'}</small></span></div>
            <div className="courier-client-address">{addressText(shipping) || 'Adresse enregistrée dans la commande'}</div>
            {shipping.instructions && <div className="courier-note">{shipping.instructions}</div>}
            <div className="courier-contact-row">
              {customerPhone && <a href={`tel:${customerPhone}`}><Phone size={17}/>Appeler</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/>WhatsApp</a>}
              {customerMap && <a href={customerMap} target="_blank" rel="noreferrer"><Navigation size={17}/>Itinéraire</a>}
            </div>
          </section>

          <section className="courier-money-box">
            <div><WalletCards size={19}/><span><strong>À encaisser au client</strong><small>Produits et livraison restent séparés.</small></span></div>
            <div className="courier-money-grid"><span><small>Produits</small><b>{usd(item.items_total_usd)}</b></span><span><small>Livraison</small><b>{cdf(item.delivery_fee_cdf)}</b></span></div>
            {item.assignment_status === 'delivered' && <p>{item.collection_status === 'remitted' ? 'Argent produits remis à One Market.' : 'Argent produits encaissé : remise à One Market en attente.'}</p>}
          </section>

          {(item.items || []).length > 0 && <details className="courier-items"><summary><PackageCheck size={17}/>Voir les articles ({(item.items || []).reduce((sum,row)=>sum+Number(row.quantity||0),0)})</summary>{(item.items || []).map((row,index)=><div key={`${row.store_id}-${index}`}><span>{row.name}</span><b>× {row.quantity}</b></div>)}</details>}

          <footer className="courier-task-actions">
            {action && <button className="courier-primary" disabled={busy === item.assignment_id} onClick={() => runAction(item, action[0])}>
              {action[0] === 'delivered' ? <CheckCircle2 size={18}/> : action[0] === 'out_for_delivery' ? <Truck size={18}/> : action[0] === 'start_pickup' ? <Bike size={18}/> : <Clock3 size={18}/>}
              {busy === item.assignment_id ? 'Mise à jour…' : action[1]}
            </button>}
            {item.assignment_status !== 'delivered' && item.assignment_status !== 'problem' && <button className="courier-problem" type="button" onClick={() => openIncident(item)}><AlertTriangle size={17}/>Signaler un problème</button>}
          </footer>
        </article>
      }) : <div className="courier-empty"><ShieldCheck size={34}/><strong>{tab === 'history' ? 'Aucune livraison terminée' : tab === 'problems' ? 'Aucun problème en cours' : 'Aucune livraison assignée'}</strong><span>Les nouvelles courses apparaîtront ici automatiquement.</span></div>}
    </section>

    {incident && <div className="courier-modal-backdrop" onMouseDown={() => setIncident(null)}>
      <form className="courier-modal" onSubmit={submitIncident} onMouseDown={event => event.stopPropagation()}>
        <div><span>Signalement</span><h2>{incident.order_number}</h2><p>Le support One Market recevra immédiatement le problème.</p></div>
        <label>Type de problème<select value={incidentForm.type} onChange={e=>setIncidentForm({...incidentForm,type:e.target.value})}>{Object.entries(INCIDENT_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label>Détails<textarea rows="4" required value={incidentForm.description} onChange={e=>setIncidentForm({...incidentForm,description:e.target.value})} placeholder="Expliquez ce qui se passe…"/></label>
        <div className="courier-modal-actions"><button type="button" onClick={() => setIncident(null)}>Annuler</button><button className="primary" disabled={busy === incident.assignment_id}>Envoyer</button></div>
      </form>
    </div>}
  </main>
}
