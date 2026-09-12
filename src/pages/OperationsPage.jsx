import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Banknote, CheckCircle2, Clock3, Package, Truck, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime, ORDER_LABELS, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, Empty, Info, Loader, SectionHead, Table } from '../components/UI'

export function OrdersPage() {
  const [status, setStatus] = useState('all')
  const { data, loading } = useLoad(async () => {
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(250)
    if (status !== 'all') query = query.eq('status', status)
    const { data: orders, error } = await query
    if (error) throw error
    return orders || []
  }, [status])

  return <>
    <SectionHead eyebrow="Opérations" title="Commandes" desc="Commandes, paiement à la livraison et flux multi-boutiques."/>
    <div className="filter-row">{['all','pending_confirmation','confirmed','preparing','ready','out_for_delivery','delivered','cancelled'].map(item => <button type="button" className={status === item ? 'active' : ''} onClick={() => setStatus(item)} key={item}>{item === 'all' ? 'Toutes' : ORDER_LABELS[item]}</button>)}</div>
    {loading ? <Loader/> : <Table headers={['Commande','Date','Statut','Livraison','Paiement','Produits','']} rows={(data || []).map(order => [
      order.order_number,
      dateTime(order.created_at),
      <Badge value={order.status} label={ORDER_LABELS[order.status]}/>,
      `${order.delivery_method === 'express' ? 'Express' : 'Normale'} · ${cdf(order.delivery_fee_cdf)}`,
      <Badge value={order.payment_status} label={order.payment_status === 'cash_received' ? 'Encaissé' : 'À encaisser'}/>,
      usd(order.items_total),
      <NavLink className="row-link" to={`/orders/${order.id}`}>Ouvrir</NavLink>,
    ])}/>} 
  </>
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { can, staff } = useAuth()
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

  async function togglePayment() {
    const next = order.payment_status === 'cash_received' ? 'pending_on_delivery' : 'cash_received'
    const { error } = await supabase.rpc('erp_set_payment_status', { p_order_id: id, p_status: next })
    if (!error) reload()
  }

  return <>
    <SectionHead eyebrow="Commande" title={order.order_number} desc={dateTime(order.created_at)} actions={canManageFinance && <button className="btn primary" type="button" onClick={togglePayment}><Banknote size={17}/>{order.payment_status === 'cash_received' ? 'Remettre à encaisser' : 'Marquer encaissé'}</button>}/>
    <div className="detail-grid">
      <section className="panel detail-card"><h3>Résumé</h3><Info label="Statut" value={<Badge value={order.status} label={ORDER_LABELS[order.status]}/>}/><Info label="Produits" value={usd(order.items_total)}/><Info label="Livraison" value={`${order.delivery_method === 'express' ? 'Express' : 'Normale'} · ${cdf(order.delivery_fee_cdf)}`}/><Info label="Paiement" value={order.payment_status === 'cash_received' ? 'Encaissé' : 'À payer au livreur'}/><Info label="Logistique" value={order.logistics_status}/></section>
      <section className="panel detail-card"><h3>Livraison</h3><Info label="Client" value={order.shipping_snapshot?.full_name || '—'}/><Info label="Téléphone" value={order.shipping_snapshot?.phone || '—'}/><Info label="Adresse" value={[order.shipping_snapshot?.address_line1, order.shipping_snapshot?.district, order.shipping_snapshot?.city].filter(Boolean).join(', ') || '—'}/><Info label="Note" value={order.customer_note || '—'}/></section>
    </div>

    <section className="panel"><h3>Sous-commandes</h3>{data.sellerOrders.length ? data.sellerOrders.map(sellerOrder => <div className="line-item" key={sellerOrder.id}><span><strong>{sellerOrder.seller_order_number}</strong><small>{sellerOrder.delivery_method === 'express' ? 'Express' : 'Normale'} · {cdf(sellerOrder.delivery_fee_cdf)}</small></span><Badge value={sellerOrder.status} label={ORDER_LABELS[sellerOrder.status]}/></div>) : <Empty/>}</section>
    <section className="panel"><h3>Articles</h3>{data.items.length ? data.items.map(item => <div className="line-item" key={item.id}><span><strong>{item.product_name}</strong><small>Qté {item.quantity}</small></span><strong>{usd(item.line_total)}</strong></div>) : <Empty/>}</section>
    <section className="panel"><h3>Historique</h3>{data.events.length ? data.events.map(event => <div className="timeline-item" key={event.id}><Clock3 size={15}/><span><strong>{event.label}</strong><small>{dateTime(event.created_at)}</small></span></div>) : <Empty/>}</section>
    {data.tickets.length > 0 && <section className="panel"><h3>Signalements liés</h3>{data.tickets.map(ticket => <NavLink className="line-item" key={ticket.id} to={`/support/${ticket.id}`}><span><strong>{ticket.ticket_number}</strong><small>{ticket.subject}</small></span><Badge value={ticket.status}/></NavLink>)}</section>}
  </>
}

export function DeliveryPage() {
  const { data, loading, reload } = useLoad(async () => {
    const { data: orders, error } = await supabase.from('orders').select('id,order_number,status,delivery_method,delivery_fee_cdf,logistics_status,shipping_snapshot,created_at').order('created_at', { ascending: false }).limit(250)
    if (error) throw error
    return orders || []
  }, [])

  async function update(order) {
    const next = window.prompt('Nouveau statut logistique :', order.logistics_status || 'pending')
    if (!next) return
    const { error } = await supabase.rpc('erp_update_delivery_status', { p_order_id: order.id, p_logistics_status: next })
    if (!error) reload()
  }

  return <>
    <SectionHead eyebrow="Opérations" title="Livraisons" desc="Normales, express et suivi logistique."/>
    {loading ? <Loader/> : <div className="cards-list">{(data || []).length ? data.map(order => <article className={`delivery-card ${order.delivery_method === 'express' ? 'express' : ''}`} key={order.id}>
      <div className="delivery-icon">{order.delivery_method === 'express' ? <Zap size={20}/> : <Truck size={20}/>}</div>
      <div className="grow"><strong>{order.order_number}</strong><span>{order.shipping_snapshot?.full_name || 'Client'} · {order.shipping_snapshot?.city || '—'}</span><small>{order.delivery_method === 'express' ? 'Express' : 'Normale'} · {cdf(order.delivery_fee_cdf)}</small></div>
      <Badge value={order.logistics_status}/><button className="btn ghost" type="button" onClick={() => update(order)}>Mettre à jour</button>
    </article>) : <Empty/>}</div>}
  </>
}
