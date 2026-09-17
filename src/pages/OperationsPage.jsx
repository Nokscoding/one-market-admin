import { useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Banknote, Clock3, Truck, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime, ORDER_LABELS, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Empty, Info, Loader, SearchBar, SectionHead, Table } from '../components/UI'

function paymentLabel(order) {
  if (order.payment_method === 'mobile_money') {
    return { awaiting_mobile_money: 'À finaliser', payment_submitted: 'Soumis', paid: 'Payé', cancelled: 'Annulé' }[order.payment_status] || order.payment_status
  }
  return order.payment_status === 'cash_received' ? 'Encaissé' : order.payment_status === 'cancelled' ? 'Annulé' : 'À payer au livreur'
}

export function OrdersPage() {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const { data, loading, error } = useLoad(async () => {
    let query = supabase.from('orders').select('id,order_number,status,delivery_method,delivery_fee_cdf,payment_method,payment_status,items_total,shipping_snapshot,created_at').order('created_at', { ascending: false }).limit(250)
    if (status !== 'all') query = query.eq('status', status)
    const { data: orders, error } = await query
    if (error) throw error
    return orders || []
  }, [status])
  const visible = useMemo(() => (data || []).filter(order => !search || `${order.order_number} ${order.shipping_snapshot?.full_name || ''} ${order.shipping_snapshot?.city || ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])

  return <>
    <SectionHead eyebrow="Opérations" title="Commandes" desc="Suivi client, paiement, livraison et répartition multi-boutiques."/>
    <div className="toolbar-row"><SearchBar value={search} onChange={setSearch} placeholder="Commande, client ou ville"/></div>
    <div className="filter-row">{['all','pending_confirmation','confirmed','preparing','ready','out_for_delivery','delivered','cancelled'].map(item => <button type="button" className={status === item ? 'active' : ''} onClick={() => setStatus(item)} key={item}>{item === 'all' ? 'Toutes' : ORDER_LABELS[item]}</button>)}</div>
    {error && <div className="alert bad">{error}</div>}
    {loading ? <Loader/> : <Table headers={['Commande','Client','Date','Statut','Livraison','Paiement','Produits','']} rows={visible.map(order => [
      order.order_number,
      <div><strong>{order.shipping_snapshot?.full_name || 'Client'}</strong><span>{order.shipping_snapshot?.city || '—'}</span></div>,
      dateTime(order.created_at),
      <Badge value={order.status} label={ORDER_LABELS[order.status]}/>,
      `${order.delivery_method === 'express' ? 'Express' : 'Normale'} · ${cdf(order.delivery_fee_cdf)}`,
      <div><strong>{order.payment_method === 'mobile_money' ? 'Mobile Money' : 'COD'}</strong><span>{paymentLabel(order)}</span></div>,
      usd(order.items_total),
      <NavLink className="row-link" to={`/orders/${order.id}`}>Ouvrir</NavLink>,
    ])}/>} 
  </>
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { can, staff } = useAuth()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single()
    if (error) throw error
    const [sellerOrders, items, events, tickets] = await Promise.all([
      supabase.from('seller_orders').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_status_events').select('*').eq('order_id', id).order('created_at'),
      supabase.from('support_tickets').select('id,ticket_number,status,subject').eq('order_id', id),
    ])
    return { order, sellerOrders: sellerOrders.data || [], items: items.data || [], events: events.data || [], tickets: tickets.data || [] }
  }, [id])

  if (loading) return <Loader/>
  if (!data?.order) return <Empty>Commande introuvable.</Empty>
  const order = data.order
  const canManageFinance = can('finance.manage') || staff?.staff_role === 'SUPER_ADMIN'
  const allowedPayments = order.payment_method === 'mobile_money' ? ['awaiting_mobile_money','payment_submitted','paid','cancelled'] : ['pending_on_delivery','cash_received','cancelled']
  const commission = data.sellerOrders.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0)
  const sellerNet = data.sellerOrders.reduce((sum, row) => sum + Number(row.seller_net_amount || 0), 0)

  function openPayment() { setActionError(''); setPaymentStatus(order.payment_status); setPaymentOpen(true) }
  async function savePayment() {
    setActionError('')
    const { error } = await supabase.rpc('erp_set_payment_status', { p_order_id: id, p_status: paymentStatus })
    if (error) return setActionError(error.message)
    setPaymentOpen(false); reload()
  }

  return <>
    <SectionHead eyebrow="Commande" title={order.order_number} desc={dateTime(order.created_at)} actions={canManageFinance && <button className="btn primary" type="button" onClick={openPayment}><Banknote size={17}/>Gérer le paiement</button>}/>
    {actionError && <div className="alert bad">{actionError}</div>}
    <div className="detail-grid">
      <section className="panel detail-card"><h3>Résumé</h3><Info label="Statut" value={<Badge value={order.status} label={ORDER_LABELS[order.status]}/>}/><Info label="Produits" value={usd(order.items_total)}/><Info label="Livraison" value={`${order.delivery_method === 'express' ? 'Express' : 'Normale'} · ${cdf(order.delivery_fee_cdf)}`}/><Info label="Méthode" value={order.payment_method === 'mobile_money' ? 'Mobile Money' : 'Paiement à la livraison'}/><Info label="Paiement" value={paymentLabel(order)}/><Info label="Logistique" value={order.logistics_status}/></section>
      <section className="panel detail-card"><h3>Livraison</h3><Info label="Client" value={order.shipping_snapshot?.full_name || '—'}/><Info label="Téléphone" value={order.shipping_snapshot?.phone || '—'}/><Info label="Adresse" value={[order.shipping_snapshot?.address_line1, order.shipping_snapshot?.district, order.shipping_snapshot?.city].filter(Boolean).join(', ') || '—'}/><Info label="Note" value={order.customer_note || '—'}/></section>
    </div>
    <section className="panel financial-split"><h3>Répartition financière</h3><div className="finance-status-grid"><div><span>Produits</span><strong>{usd(order.items_total)}</strong></div><div><span>Commission One Market</span><strong>{usd(commission)}</strong></div><div><span>À reverser vendeurs</span><strong>{usd(sellerNet)}</strong></div><div><span>Livraison</span><strong>{cdf(order.delivery_fee_cdf)}</strong></div></div></section>
    <section className="panel"><h3>Sous-commandes</h3>{data.sellerOrders.length ? data.sellerOrders.map(sellerOrder => <div className="line-item" key={sellerOrder.id}><span><strong>{sellerOrder.seller_order_number}</strong><small>{sellerOrder.delivery_method === 'express' ? 'Express' : 'Normale'} · {cdf(sellerOrder.delivery_fee_cdf)} · commission {Number(sellerOrder.commission_percent||0).toFixed(2)}%</small></span><div><Badge value={sellerOrder.status} label={ORDER_LABELS[sellerOrder.status]}/><small>{usd(sellerOrder.seller_net_amount)} vendeur</small></div></div>) : <Empty/>}</section>
    <section className="panel"><h3>Articles</h3>{data.items.length ? data.items.map(item => <div className="line-item" key={item.id}><span><strong>{item.product_name}</strong><small>Qté {item.quantity}</small></span><strong>{usd(item.line_total)}</strong></div>) : <Empty/>}</section>
    <section className="panel"><h3>Historique</h3>{data.events.length ? data.events.map(event => <div className="timeline-item" key={event.id}><Clock3 size={15}/><span><strong>{event.label}</strong><small>{dateTime(event.created_at)}</small></span></div>) : <Empty/>}</section>
    {data.tickets.length > 0 && <section className="panel"><h3>Signalements liés</h3>{data.tickets.map(ticket => <NavLink className="line-item" key={ticket.id} to={`/support/${ticket.id}`}><span><strong>{ticket.ticket_number}</strong><small>{ticket.subject}</small></span><Badge value={ticket.status}/></NavLink>)}</section>}
    <ConfirmModal open={paymentOpen} title="Modifier le paiement" text={order.order_number} onClose={() => setPaymentOpen(false)} onConfirm={savePayment}><label>Statut<select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>{allowedPayments.map(status => <option key={status} value={status}>{status}</option>)}</select></label></ConfirmModal>
  </>
}

export function DeliveryPage() {
  const [filters, setFilters] = useState({ type:'', status:'', city:'' })
  const [modal, setModal] = useState(null)
  const [nextStatus, setNextStatus] = useState('pending')
  const [actionError, setActionError] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const { data: orders, error } = await supabase.from('orders').select('id,order_number,status,delivery_method,delivery_fee_cdf,logistics_status,shipping_snapshot,created_at').order('created_at', { ascending: false }).limit(250)
    if (error) throw error
    return orders || []
  }, [])
  const visible = useMemo(() => (data || []).filter(order => (!filters.type || order.delivery_method===filters.type) && (!filters.status || order.logistics_status===filters.status) && (!filters.city || (order.shipping_snapshot?.city||'').toLowerCase().includes(filters.city.toLowerCase()))), [data, filters])
  function openUpdate(order){ setActionError(''); setNextStatus(order.logistics_status||'pending'); setModal(order) }
  async function save(){ const {error}=await supabase.rpc('erp_update_delivery_status',{p_order_id:modal.id,p_logistics_status:nextStatus}); if(error)return setActionError(error.message); setModal(null); reload() }

  return <>
    <SectionHead eyebrow="Opérations" title="Livraisons" desc="Préparation, express, suivi logistique et incidents."/>
    <div className="toolbar-row"><input className="filter-input" placeholder="Filtrer par ville" value={filters.city} onChange={e=>setFilters({...filters,city:e.target.value})}/><select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">Tous les types</option><option value="standard">Normale</option><option value="express">Express</option></select><select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Tous les statuts</option>{['pending','preparing','ready','out_for_delivery','delivered','failed','problem'].map(s=><option key={s}>{s}</option>)}</select></div>
    {actionError && <div className="alert bad">{actionError}</div>}
    {loading ? <Loader/> : <div className="cards-list">{visible.length ? visible.map(order => <article className={`delivery-card ${order.delivery_method === 'express' ? 'express' : ''}`} key={order.id}><div className="delivery-icon">{order.delivery_method === 'express' ? <Zap size={20}/> : <Truck size={20}/>}</div><div className="grow"><strong>{order.order_number}</strong><span>{order.shipping_snapshot?.full_name || 'Client'} · {order.shipping_snapshot?.city || '—'}</span><small>{order.delivery_method === 'express' ? 'Express' : 'Normale'} · {cdf(order.delivery_fee_cdf)}</small></div><Badge value={order.logistics_status}/><button className="btn ghost" type="button" onClick={() => openUpdate(order)}>Mettre à jour</button></article>) : <Empty/>}</div>}
    <ConfirmModal open={!!modal} title="Mettre à jour la livraison" text={modal?.order_number} onClose={()=>setModal(null)} onConfirm={save}><label>Statut<select value={nextStatus} onChange={e=>setNextStatus(e.target.value)}>{['pending','preparing','ready','out_for_delivery','delivered','failed','problem'].map(s=><option key={s}>{s}</option>)}</select></label></ConfirmModal>
  </>
}
