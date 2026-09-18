import { adminUserError } from '../lib/userErrors'
import { useState } from 'react'
import { Banknote, CircleDollarSign, Clock3, CreditCard, WalletCards, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime, usd, statusLabel } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Empty, Loader, Metric, SectionHead, Table } from '../components/UI'

const money = (value, currency = 'USD') => currency === 'CDF' ? cdf(value) : usd(value)

export function FinancePage() {
  const { can, staff } = useAuth()
  const canManage = staff?.staff_role === 'SUPER_ADMIN' || can('finance.manage')
  const [tab, setTab] = useState('overview')
  const [paymentModal, setPaymentModal] = useState(null)
  const [payoutModal, setPayoutModal] = useState(null)
  const [actionError, setActionError] = useState('')
  const [form, setForm] = useState({ status: '', reference: '', note: '', method: 'mobile_money', from: '', to: '' })
  const { data, loading, error, reload } = useLoad(async () => {
    const [{ data: dashboard, error: dashError }, { data: orders, error: orderError }, { data: payouts, error: payoutError }, { data: stores, error: storeError }] = await Promise.all([
      supabase.rpc('erp_finance_dashboard', { p_from: null, p_to: null }),
      supabase.from('orders').select('id,order_number,status,payment_method,payment_status,currency,items_total,delivery_fee_cdf,created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('seller_payouts').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.rpc('erp_stores_overview', { p_search: null, p_status: null, p_limit: 250, p_offset: 0 }),
    ])
    if (dashError) throw dashError
    if (orderError) throw orderError
    if (payoutError) throw payoutError
    if (storeError) throw storeError
    return { dashboard: dashboard || {}, orders: orders || [], payouts: payouts || [], stores: stores || [] }
  }, [])
  if (loading) return <Loader/>
  if (error || !data) return <div className="alert bad" role="alert">{error || 'Impossible de charger les finances.'}<button className="btn ghost" onClick={reload}>Réessayer</button></div>
  const m = data.dashboard?.metrics || {}

  function openPayment(order) {
    const statuses = order.payment_method === 'mobile_money' ? ['awaiting_mobile_money', 'payment_submitted', 'paid', 'cancelled'] : ['pending_on_delivery', 'cash_received', 'cancelled']
    setActionError('')
    setForm({ status: order.payment_status, reference: '', note: '', method: order.payment_method, from: '', to: '' })
    setPaymentModal({ ...order, statuses })
  }
  async function savePayment() {
    setActionError('')
    const { error } = await supabase.rpc('erp_set_payment_status', { p_order_id: paymentModal.id, p_status: form.status })
    if (error) return setActionError(adminUserError(error))
    setPaymentModal(null); reload()
  }
  function openPayout(store) {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30)
    setActionError('')
    setForm({ status: 'pending', reference: '', note: '', method: 'mobile_money', from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) })
    setPayoutModal({ kind: 'create', store })
  }
  async function createPayout() {
    setActionError('')
    const { error } = await supabase.rpc('erp_create_seller_payout', { p_store_id: payoutModal.store.id, p_period_start: `${form.from}T00:00:00Z`, p_period_end: `${form.to}T23:59:59Z`, p_payment_method: form.method, p_note: form.note || null })
    if (error) return setActionError(adminUserError(error))
    setPayoutModal(null); reload()
  }
  function editPayout(payout) {
    setActionError('')
    setForm({ status: payout.status, reference: payout.payment_reference || '', note: payout.note || '', method: payout.payment_method, from: '', to: '' })
    setPayoutModal({ kind: 'status', payout })
  }
  async function savePayout() {
    setActionError('')
    const { error } = await supabase.rpc('erp_set_seller_payout_status', { p_payout_id: payoutModal.payout.id, p_status: form.status, p_payment_reference: form.reference || null, p_note: form.note || null })
    if (error) return setActionError(adminUserError(error))
    setPayoutModal(null); reload()
  }

  return <>
    <SectionHead eyebrow="Finances" title="Centre financier" desc="Commissions, encaissements, vendeurs à payer et historique des règlements."/>
    <div className="tabs">{[['overview','Vue d’ensemble'],['orders','Commandes'],['commissions','Commissions'],['payouts','Vendeurs à payer'],['transactions','Transactions']].map(([v,l]) => <button className={tab === v ? 'active' : ''} onClick={() => setTab(v)} key={v}>{l}</button>)}</div>
    {(error || actionError) && <div className="alert bad">{error || actionError}</div>}

    {tab === 'overview' && <><div className="metrics-grid"><Metric icon={CircleDollarSign} label="GMV 30 jours" value={usd(m.gmv_usd)}/><Metric icon={Banknote} label="Commissions" value={usd(m.commissions_generated_usd)} sub={`encaissées ${usd(m.commissions_collected_usd)}`}/><Metric icon={WalletCards} label="Dû aux vendeurs" value={usd(m.seller_due_usd)}/><Metric icon={Zap} label="Abonnements" value={cdf(m.subscription_revenue_cdf)}/></div><div className="dashboard-columns"><section className="panel"><h3>Encaissements</h3><div className="finance-status-grid"><div><span>COD à encaisser</span><strong>{m.cod_pending || 0}</strong></div><div><span>Mobile Money en attente</span><strong>{m.mobile_pending || 0}</strong></div><div><span>Mobile Money payés</span><strong>{m.mobile_paid || 0}</strong></div><div><span>Problèmes</span><strong>{m.payment_problems || 0}</strong></div></div></section><section className="panel"><h3>Règlements vendeurs</h3><div className="finance-status-grid"><div><span>En attente</span><strong>{m.payouts_pending || 0}</strong></div><div><span>Payés</span><strong>{usd(m.seller_paid_usd)}</strong></div><div><span>À payer</span><strong>{usd(m.seller_due_usd)}</strong></div><div><span>Livraison</span><strong>{cdf(m.delivery_revenue_cdf)}</strong></div></div></section></div></>}

    {tab === 'orders' && <Table headers={['Commande','Date','Méthode','Produits','Livraison','Paiement','']} rows={data.orders.map(order => [order.order_number, dateTime(order.created_at), order.payment_method === 'mobile_money' ? 'Mobile Money' : 'À la livraison', money(order.items_total, order.currency), cdf(order.delivery_fee_cdf), <Badge value={order.payment_status}/>, canManage ? <button className="row-action" onClick={() => openPayment(order)}>Gérer</button> : '—'])}/>} 

    {tab === 'commissions' && <section className="panel"><h3>Commission effective par boutique</h3>{data.stores.length ? data.stores.map(store => <div className="line-item" key={store.id}><span><strong>{store.name}</strong><small>{store.commission_source === 'custom' ? 'Commission personnalisée' : 'Commission générale'}</small></span><div className="button-row compact"><strong>{Number(store.commission_percent || 0).toFixed(2)} %</strong><span>{usd(store.sales_usd)} vendus</span></div></div>) : <Empty/>}</section>}

    {tab === 'payouts' && <><section className="panel"><h3>Boutiques à payer</h3>{data.stores.filter(s => Number(s.seller_due_usd) > 0).length ? data.stores.filter(s => Number(s.seller_due_usd) > 0).map(store => <div className="line-item" key={store.id}><span><strong>{store.name}</strong><small>{store.owner_name || store.owner_email || 'Vendeur'}</small></span><div className="button-row compact"><strong>{usd(store.seller_due_usd)}</strong>{canManage && <button className="btn primary" onClick={() => openPayout(store)}>Créer un règlement</button>}</div></div>) : <Empty>Aucune boutique à payer.</Empty>}</section><section className="panel"><h3>Historique des règlements</h3><Table headers={['N°','Boutique','Période','Brut','Commission','Net','Statut','']} rows={data.payouts.map(p => { const store = data.stores.find(s => s.id === p.store_id); return [p.payout_number, store?.name || 'Boutique', `${new Date(p.period_start).toLocaleDateString('fr-FR')} → ${new Date(p.period_end).toLocaleDateString('fr-FR')}`, money(p.gross_amount,p.currency), money(p.commission_amount,p.currency), money(p.net_amount,p.currency), <Badge value={p.status}/>, canManage ? <button className="row-action" onClick={() => editPayout(p)}>Gérer</button> : '—'] })}/></section></>}

    {tab === 'transactions' && <Table headers={['Type','Référence','Montant','Statut','Date']} rows={[...data.payouts.map(p => ['Règlement vendeur',p.payout_number,money(p.net_amount,p.currency),<Badge value={p.status}/>,dateTime(p.created_at)]), ...data.orders.slice(0,100).map(o => ['Commande',o.order_number,money(o.items_total, o.currency),<Badge value={o.payment_status}/>,dateTime(o.created_at)])]}/>} 

    <ConfirmModal open={!!paymentModal} title="Gérer le paiement" text={paymentModal?.order_number} onClose={() => setPaymentModal(null)} onConfirm={savePayment}><label>Statut<select value={form.status} onChange={e => setForm({...form,status:e.target.value})}>{paymentModal?.statuses?.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></ConfirmModal>
    <ConfirmModal open={payoutModal?.kind === 'create'} title="Créer un règlement vendeur" text={payoutModal?.store?.name} onClose={() => setPayoutModal(null)} onConfirm={createPayout}><div className="form-grid"><label>Du<input type="date" value={form.from} onChange={e => setForm({...form,from:e.target.value})}/></label><label>Au<input type="date" value={form.to} onChange={e => setForm({...form,to:e.target.value})}/></label><label>Moyen<select value={form.method} onChange={e => setForm({...form,method:e.target.value})}><option value="mobile_money">Mobile Money</option><option value="bank">Banque</option><option value="cash">Cash</option><option value="other">Autre</option></select></label><label>Note<input value={form.note} onChange={e => setForm({...form,note:e.target.value})}/></label></div></ConfirmModal>
    <ConfirmModal open={payoutModal?.kind === 'status'} title="Mettre à jour le règlement" text={payoutModal?.payout?.payout_number} onClose={() => setPayoutModal(null)} onConfirm={savePayout}><div className="form-grid"><label>Statut<select value={form.status} onChange={e => setForm({...form,status:e.target.value})}>{['pending','approved','paid','failed','cancelled'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>Référence<input value={form.reference} onChange={e => setForm({...form,reference:e.target.value})} placeholder="Transaction Mobile Money / banque"/></label><label className="wide">Note<textarea rows={3} value={form.note} onChange={e => setForm({...form,note:e.target.value})}/></label></div></ConfirmModal>
  </>
}

export function SubscriptionsPage() {
  const { can, staff } = useAuth()
  const canManage = staff?.staff_role === 'SUPER_ADMIN' || can('subscriptions.manage') || can('finance.manage')
  const [modal, setModal] = useState(null)
  const [actionError, setActionError] = useState('')
  const [form, setForm] = useState({ status:'active', starts_at:'', ends_at:'', amount:'', currency:'CDF', method:'mobile_money', reference:'', note:'', price:'', standard:'', express:'', plan_status:'active' })
  const { data, loading, error, reload } = useLoad(async () => { const { data, error } = await supabase.rpc('erp_subscription_overview'); if (error) throw error; return data || {metrics:{},subscriptions:[],plans:[]} }, [])
  if (loading) return <Loader/>
  if (error || !data) return <div className="alert bad" role="alert">{error || 'Impossible de charger les abonnements.'}<button className="btn ghost" onClick={reload}>Réessayer</button></div>
  const m = data.metrics || {}
  function manageSub(s) { setActionError(''); setForm({...form,status:s.status,starts_at:s.starts_at?.slice(0,10)||'',ends_at:s.ends_at?.slice(0,10)||''}); setModal({type:'subscription',item:s}) }
  async function saveSub() { setActionError(''); const {error}=await supabase.rpc('erp_set_subscription_status',{p_subscription_id:modal.item.id,p_status:form.status,p_starts_at:form.starts_at?`${form.starts_at}T00:00:00Z`:null,p_ends_at:form.ends_at?`${form.ends_at}T23:59:59Z`:null}); if(error)return setActionError(adminUserError(error)); setModal(null); reload() }
  function recordPayment(s) { setActionError(''); setForm({...form,amount:String(s.plan_price_cdf||''),currency:'CDF',method:'mobile_money',reference:'',note:''}); setModal({type:'payment',item:s}) }
  async function saveSubscriptionPayment() { setActionError(''); const {error}=await supabase.rpc('erp_record_subscription_payment',{p_subscription_id:modal.item.id,p_amount:Number(form.amount),p_currency:form.currency,p_payment_method:form.method,p_payment_reference:form.reference||null,p_payment_status:'paid',p_note:form.note||null}); if(error)return setActionError(adminUserError(error)); setModal(null); reload() }
  function editPlan(p) { setActionError(''); setForm({...form,price:String(p.price_cdf),standard:String(p.standard_fee_cdf),express:String(p.express_fee_cdf),plan_status:p.status}); setModal({type:'plan',item:p}) }
  async function savePlan() { setActionError(''); const {error}=await supabase.rpc('erp_update_subscription_plan',{p_plan_id:modal.item.id,p_price_cdf:Math.round(Number(form.price)),p_standard_fee_cdf:Math.round(Number(form.standard)),p_express_fee_cdf:Math.round(Number(form.express)),p_status:form.plan_status}); if(error)return setActionError(adminUserError(error)); setModal(null); reload() }
  return <>
    <SectionHead eyebrow="Finances" title="Abonnements One Market" desc="Plans, clients, renouvellements et paiements réels."/>
    {(error || actionError) && <div className="alert bad">{error || actionError}</div>}
    <div className="metrics-grid"><Metric icon={Zap} label="Actifs" value={m.active||0}/><Metric icon={Clock3} label="Expirent sous 7 jours" value={m.expiring_soon||0}/><Metric icon={CreditCard} label="Revenu du mois" value={cdf(m.revenue_month_cdf)}/><Metric icon={Banknote} label="Revenu total" value={cdf(m.revenue_total_cdf)}/></div>
    <div className="plan-grid">{(data.plans||[]).map(plan => <article className="plan-card" key={plan.id}><span>{plan.duration_months} mois</span><h3>{plan.name}</h3><strong>{cdf(plan.price_cdf)}</strong><small>Standard {cdf(plan.standard_fee_cdf)} · Express {cdf(plan.express_fee_cdf)}</small><Badge value={plan.status}/>{canManage&&<button className="btn ghost" onClick={() => editPlan(plan)}>Modifier</button>}</article>)}</div>
    <section className="panel"><h3>Abonnements clients</h3><Table headers={['Client','Plan','Statut','Début','Fin','Dernier paiement','']} rows={(data.subscriptions||[]).map(s => [<div><strong>{s.customer_name||'Sans nom'}</strong><span>{s.customer_email||s.customer_id}</span></div>,<div><strong>{s.plan_name}</strong><span>{cdf(s.plan_price_cdf)}</span></div>,<Badge value={s.status}/>,dateTime(s.starts_at),dateTime(s.ends_at),s.last_payment?<div><strong>{money(s.last_payment.amount,s.last_payment.currency)}</strong><span>{s.last_payment.payment_status}</span></div>:'—',canManage?<div className="button-row compact"><button className="row-action" onClick={() => manageSub(s)}>Gérer</button><button className="row-action" onClick={() => recordPayment(s)}>Paiement</button></div>:'—'])}/></section>
    <ConfirmModal open={modal?.type === 'subscription'} title="Gérer l’abonnement" text={modal?.item?.customer_name} onClose={() => setModal(null)} onConfirm={saveSub}><div className="form-grid"><label>Statut<select value={form.status} onChange={e => setForm({...form,status:e.target.value})}>{['pending','active','expired','cancelled'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>Début<input type="date" value={form.starts_at} onChange={e => setForm({...form,starts_at:e.target.value})}/></label><label>Fin<input type="date" value={form.ends_at} onChange={e => setForm({...form,ends_at:e.target.value})}/></label></div></ConfirmModal>
    <ConfirmModal open={modal?.type === 'payment'} title="Enregistrer un paiement" text={modal?.item?.customer_name} onClose={() => setModal(null)} onConfirm={saveSubscriptionPayment}><div className="form-grid"><label>Montant<input type="number" min="0" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})}/></label><label>Devise<select value={form.currency} onChange={e => setForm({...form,currency:e.target.value})}><option value="CDF">CDF</option><option value="USD">USD</option></select></label><label>Moyen<select value={form.method} onChange={e => setForm({...form,method:e.target.value})}><option value="mobile_money">Mobile Money</option><option value="bank">Banque</option><option value="cash">Cash</option><option value="other">Autre</option></select></label><label>Référence<input value={form.reference} onChange={e => setForm({...form,reference:e.target.value})}/></label><label className="wide">Note<textarea rows={3} value={form.note} onChange={e => setForm({...form,note:e.target.value})}/></label></div></ConfirmModal>
    <ConfirmModal open={modal?.type === 'plan'} title="Modifier le plan" text={modal?.item?.name} onClose={() => setModal(null)} onConfirm={savePlan}><div className="form-grid"><label>Prix CDF<input type="number" value={form.price} onChange={e => setForm({...form,price:e.target.value})}/></label><label>Standard CDF<input type="number" value={form.standard} onChange={e => setForm({...form,standard:e.target.value})}/></label><label>Express CDF<input type="number" value={form.express} onChange={e => setForm({...form,express:e.target.value})}/></label><label>Statut<select value={form.plan_status} onChange={e => setForm({...form,plan_status:e.target.value})}><option value="coming_soon">coming_soon</option><option value="active">active</option><option value="retired">retired</option></select></label></div></ConfirmModal>
  </>
}
