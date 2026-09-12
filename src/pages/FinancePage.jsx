import { Banknote, CheckCircle2, Clock3, MessageCircle, Truck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, Empty, Loader, Metric, SectionHead, Table } from '../components/UI'

function paymentLabel(order) {
  if (order.payment_method === 'mobile_money') {
    return {
      awaiting_mobile_money: 'À finaliser',
      payment_submitted: 'Soumis',
      paid: 'Payé',
      cancelled: 'Annulé',
    }[order.payment_status] || order.payment_status
  }
  return order.payment_status === 'cash_received' ? 'Encaissé' : order.payment_status === 'cancelled' ? 'Annulé' : 'À encaisser'
}

export function FinancePage() {
  const { can, staff } = useAuth()
  const { data, loading, reload } = useLoad(async () => {
    const { data: orders, error } = await supabase.from('orders').select('id,order_number,status,payment_method,payment_status,items_total,delivery_fee_cdf,created_at').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return orders || []
  }, [])

  if (loading) return <Loader/>
  const orders = data || []
  const delivered = orders.filter(order => order.status === 'delivered')
  const salesUsd = delivered.reduce((sum, order) => sum + Number(order.items_total || 0), 0)
  const deliveryCdf = delivered.reduce((sum, order) => sum + Number(order.delivery_fee_cdf || 0), 0)
  const codPending = orders.filter(order => order.payment_method === 'cod' && order.payment_status === 'pending_on_delivery').length
  const mobilePending = orders.filter(order => order.payment_method === 'mobile_money' && ['awaiting_mobile_money','payment_submitted'].includes(order.payment_status)).length
  const received = orders.filter(order => ['cash_received','paid'].includes(order.payment_status)).length
  const canManage = staff?.staff_role === 'SUPER_ADMIN' || can('finance.manage')

  async function changePayment(order) {
    if (!canManage) return
    const allowed = order.payment_method === 'mobile_money'
      ? ['awaiting_mobile_money','payment_submitted','paid','cancelled']
      : ['pending_on_delivery','cash_received','cancelled']
    const next = window.prompt(`Statut paiement (${allowed.join(' / ')}) :`, order.payment_status)
    if (!next || !allowed.includes(next)) return
    const { error } = await supabase.rpc('erp_set_payment_status', { p_order_id: order.id, p_status: next })
    if (error) window.alert(error.message)
    else reload()
  }

  return <>
    <SectionHead eyebrow="Finances" title="Paiements & encaissements" desc="COD et Mobile Money sont suivis séparément, sans mélanger les devises."/>
    <div className="metrics-grid">
      <Metric icon={Banknote} label="Ventes livrées" value={usd(salesUsd)}/>
      <Metric icon={Truck} label="Livraisons livrées" value={cdf(deliveryCdf)}/>
      <Metric icon={Clock3} label="COD à encaisser" value={codPending}/>
      <Metric icon={MessageCircle} label="Mobile Money en attente" value={mobilePending}/>
      <Metric icon={CheckCircle2} label="Paiements reçus" value={received}/>
    </div>
    <section className="panel"><h3>Commandes financières</h3><Table headers={['Commande','Date','Méthode','Produits','Livraison','Paiement','']} rows={orders.map(order => [
      order.order_number,
      dateTime(order.created_at),
      order.payment_method === 'mobile_money' ? 'Mobile Money' : 'À la livraison',
      usd(order.items_total),
      cdf(order.delivery_fee_cdf),
      <Badge value={order.payment_status} label={paymentLabel(order)}/>,
      canManage ? <button className="row-action" type="button" onClick={() => changePayment(order)}>Modifier</button> : '—',
    ])}/></section>
  </>
}

export function SubscriptionsPage() {
  const { can, staff } = useAuth()
  const { data, loading, reload } = useLoad(async () => {
    const [{ data: plans, error: planError }, { data: subscriptions, error: subError }] = await Promise.all([
      supabase.from('delivery_subscription_plans').select('*').order('duration_months'),
      supabase.from('customer_delivery_subscriptions').select('*').order('created_at', { ascending: false }),
    ])
    if (planError) throw planError
    if (subError) throw subError
    return { plans: plans || [], subscriptions: subscriptions || [] }
  }, [])

  const canManage = staff?.staff_role === 'SUPER_ADMIN' || can('subscriptions.manage')

  async function changeStatus(subscription) {
    if (!canManage) return
    const next = window.prompt('Statut : pending / active / expired / cancelled', subscription.status)
    if (!next) return
    const { error } = await supabase.rpc('erp_set_subscription_status', { p_subscription_id: subscription.id, p_status: next, p_starts_at: null, p_ends_at: null })
    if (error) window.alert(error.message)
    else reload()
  }

  async function editPlan(plan) {
    if (!canManage) return
    const price = Number(window.prompt('Prix du plan en FC :', plan.price_cdf))
    if (!Number.isFinite(price) || price < 0) return
    const standard = Number(window.prompt('Livraison standard pour les abonnés (FC) :', plan.standard_fee_cdf))
    if (!Number.isFinite(standard) || standard < 0) return
    const express = Number(window.prompt('Livraison express pour les abonnés (FC) :', plan.express_fee_cdf))
    if (!Number.isFinite(express) || express < 0) return
    const status = window.prompt('Statut : coming_soon / active / retired', plan.status)
    if (!status) return
    const { error } = await supabase.rpc('erp_update_subscription_plan', {
      p_plan_id: plan.id,
      p_price_cdf: Math.round(price),
      p_standard_fee_cdf: Math.round(standard),
      p_express_fee_cdf: Math.round(express),
      p_status: status,
    })
    if (error) window.alert(error.message)
    else reload()
  }

  return <>
    <SectionHead eyebrow="Finances" title="One Market Plus" desc="Plans, prix, avantages livraison et abonnements clients."/>
    {loading ? <Loader/> : <>
      <div className="plan-grid">{data.plans.map(plan => <article className="plan-card" key={plan.id}><span>{plan.duration_months} mois</span><h3>{plan.name}</h3><strong>{cdf(plan.price_cdf)}</strong><small>Standard {cdf(plan.standard_fee_cdf)} · Express {cdf(plan.express_fee_cdf)}</small><Badge value={plan.status}/>{canManage && <button className="btn ghost" type="button" onClick={() => editPlan(plan)}>Modifier le plan</button>}</article>)}</div>
      <section className="panel"><h3>Abonnements</h3>{data.subscriptions.length ? <Table headers={['Client','Plan','Statut','Début','Fin','']} rows={data.subscriptions.map(subscription => [
        subscription.customer_id.slice(0, 8), subscription.plan_id.slice(0, 8), <Badge value={subscription.status}/>, dateTime(subscription.starts_at), dateTime(subscription.ends_at), canManage ? <button className="row-action" type="button" onClick={() => changeStatus(subscription)}>Modifier</button> : '—',
      ])}/> : <Empty/>}</section>
    </>}
  </>
}
