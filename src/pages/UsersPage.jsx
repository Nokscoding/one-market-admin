import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { dateTime, ORDER_LABELS, usd } from '../lib/format'
import { MARKETPLACE_ROLES, ROLE_LABELS, STAFF_ROLES } from '../lib/roles'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Empty, Info, Loader, SearchBar, SectionHead, Table } from '../components/UI'

export function UsersPage() {
  const { staff } = useAuth()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data, loading, error, reload } = useLoad(async () => {
    const { data: users, error } = await supabase.rpc('erp_list_users', { p_search: search || null, p_limit: 100, p_offset: 0 })
    if (error) throw error
    return users || []
  }, [search])

  return <>
    <SectionHead eyebrow="Marketplace" title="Utilisateurs" desc="Comptes, activité commerciale et accès One Market." actions={staff?.staff_role === 'SUPER_ADMIN' && <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>Créer un utilisateur</button>}/>
    <SearchBar value={search} onChange={setSearch} placeholder="Nom, email, téléphone ou UUID"/>
    {error && <div className="alert bad">{error}</div>}
    {loading ? <Loader/> : <Table headers={['Utilisateur','Rôle','Statut','Commandes','Dépensé','Abonnement','Création','']} rows={(data || []).map(user => [
      <div><strong>{user.full_name || 'Sans nom'}</strong><span>{user.email}{user.staff_role ? ` · ${ROLE_LABELS[user.staff_role] || user.staff_role}` : ''}</span></div>,
      user.role,
      <Badge value={user.account_status}/>,
      user.order_count || 0,
      usd(user.amount_spent_usd),
      user.active_subscription ? <Badge value="active" label="Actif"/> : '—',
      dateTime(user.created_at),
      <NavLink className="row-link" to={`/users/${user.id}`}>Ouvrir</NavLink>,
    ])}/>} 
    <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload() }}/>
  </>
}

function CreateUserModal({ open, onClose, onDone }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', marketplace_role: 'client', staff_role: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!open) return null

  const availableStaffRoles = form.marketplace_role === 'client' ? STAFF_ROLES.filter(role => role !== 'SUPER_ADMIN') : STAFF_ROLES

  async function submit(event) {
    event.preventDefault()
    if (form.marketplace_role === 'client' && form.staff_role === 'SUPER_ADMIN') {
      setMessage('Un compte client ne peut pas être DG / Super Admin.')
      return
    }
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.functions.invoke('erp-create-user', { body: { ...form, staff_role: form.staff_role || null } })
    if (error || data?.error) {
      const code = data?.error || error?.message || ''
      setMessage(code === 'CLIENT_CANNOT_BE_SUPER_ADMIN' ? 'Un compte client ne peut pas être DG / Super Admin.' : code || 'Impossible de créer le compte.')
    } else onDone()
    setBusy(false)
  }

  function setMarketplaceRole(value) {
    setForm(current => ({ ...current, marketplace_role: value, staff_role: value === 'client' && current.staff_role === 'SUPER_ADMIN' ? '' : current.staff_role }))
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h3>Créer un utilisateur</h3><p>Le DG peut créer un compte One Market et lui donner, si nécessaire, un accès ERP.</p></div><button type="button" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <label>Nom complet<input required value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })}/></label>
      <label>Email<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label>Mot de passe initial<input required type="password" minLength={8} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <label>Rôle marketplace<select value={form.marketplace_role} onChange={event => setMarketplaceRole(event.target.value)}>{MARKETPLACE_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="wide">Accès ERP<select value={form.staff_role} onChange={event => setForm({ ...form, staff_role: event.target.value })}><option value="">Aucun accès ERP</option>{availableStaffRoles.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
    </div>
    {message && <div className="alert bad">{message}</div>}
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy}>{busy ? 'Création…' : 'Créer le compte'}</button></div>
  </form></div>
}

export function UserDetailPage() {
  const { id } = useParams()
  const { can, staff } = useAuth()
  const [pendingStatus, setPendingStatus] = useState(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const { data: users, error } = await supabase.rpc('erp_list_users', { p_search: id, p_limit: 20, p_offset: 0 })
    if (error) throw error
    const user = (users || []).find(item => item.id === id)
    if (!user) return null
    const [orders, tickets, stores] = await Promise.all([
      supabase.from('orders').select('id,order_number,status,created_at,grand_total,items_total,currency').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('support_tickets').select('id,ticket_number,status,subject,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('stores').select('id,name,status,is_verified,is_partner').eq('owner_id', id),
    ])
    return { user, orders: orders.data || [], tickets: tickets.data || [], stores: stores.data || [] }
  }, [id])

  if (loading) return <Loader/>
  if (!data?.user) return <Empty>Utilisateur introuvable.</Empty>

  async function changeStatus(status) {
    setActionError('')
    const { error } = await supabase.rpc('erp_set_user_status', { p_user_id: id, p_status: status, p_reason: reason || 'Réactivation ERP' })
    if (error) return setActionError(error.message)
    setPendingStatus(null); setReason(''); reload()
  }

  const user = data.user
  const canSuspend = can('users.suspend') || staff?.staff_role === 'SUPER_ADMIN'

  return <>
    <SectionHead eyebrow="Utilisateur" title={user.full_name || user.email} desc={user.email}/>
    {(error || actionError) && <div className="alert bad">{error || actionError}</div>}
    <div className="metrics-grid">
      <article className="metric"><div><span>Commandes</span><strong>{user.order_count || 0}</strong><small>historique client</small></div></article>
      <article className="metric"><div><span>Montant dépensé</span><strong>{usd(user.amount_spent_usd)}</strong><small>hors commandes annulées</small></div></article>
      <article className="metric"><div><span>Dernière commande</span><strong>{dateTime(user.last_order_at)}</strong></div></article>
      <article className="metric"><div><span>Abonnement</span><strong>{user.active_subscription ? 'Actif' : 'Aucun actif'}</strong></div></article>
    </div>
    <div className="detail-grid">
      <section className="panel detail-card"><h3>Compte</h3><Info label="Rôle" value={user.role}/><Info label="Statut" value={<Badge value={user.account_status}/>}/><Info label="Téléphone" value={user.phone || '—'}/><Info label="Inscrit" value={dateTime(user.created_at)}/><Info label="Accès ERP" value={user.staff_role ? ROLE_LABELS[user.staff_role] : 'Aucun'}/>{canSuspend && <div className="button-row">{user.account_status === 'active' ? <button className="btn danger" type="button" onClick={() => setPendingStatus('suspended')}>Suspendre</button> : <button className="btn primary" type="button" onClick={() => { setReason('Réactivation ERP'); setPendingStatus('active') }}>Réactiver</button>}</div>}</section>
      <section className="panel"><h3>Boutiques</h3>{data.stores.length ? data.stores.map(store => <div className="line-item" key={store.id}><span><strong>{store.name}</strong><small>{store.status}</small></span>{store.is_partner ? <span className="trust gold">Partenaire</span> : store.is_verified ? <span className="trust blue">Vérifiée</span> : null}</div>) : <Empty/>}</section>
    </div>
    <section className="panel"><h3>Commandes</h3>{data.orders.length ? data.orders.map(order => <NavLink className="line-item" to={`/orders/${order.id}`} key={order.id}><span><strong>{order.order_number}</strong><small>{dateTime(order.created_at)} · {usd(order.items_total || order.grand_total)}</small></span><Badge value={order.status} label={ORDER_LABELS[order.status]}/></NavLink>) : <Empty/>}</section>
    <section className="panel"><h3>Signalements</h3>{data.tickets.length ? data.tickets.map(ticket => <NavLink className="line-item" to={`/support/${ticket.id}`} key={ticket.id}><span><strong>{ticket.ticket_number}</strong><small>{ticket.subject}</small></span><Badge value={ticket.status}/></NavLink>) : <Empty/>}</section>
    <ConfirmModal open={Boolean(pendingStatus)} title={pendingStatus === 'active' ? 'Réactiver le compte' : 'Suspendre le compte'} text={pendingStatus === 'active' ? 'Le compte retrouvera son accès One Market.' : 'L’utilisateur perdra son accès actif à One Market.'} danger={pendingStatus !== 'active'} onClose={() => setPendingStatus(null)} onConfirm={() => changeStatus(pendingStatus)}><label>Motif<textarea rows={3} required value={reason} onChange={event => setReason(event.target.value)}/></label></ConfirmModal>
  </>
}
