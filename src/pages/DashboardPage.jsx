import { AlertTriangle, BadgeCheck, Banknote, CircleDollarSign, Headphones, Package, ShoppingBag, Store, Users, WalletCards, Zap } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Empty, Loader, Metric, SectionHead } from '../components/UI'

const RANGES = {
  today: () => { const from = new Date(); from.setHours(0,0,0,0); return [from, new Date()] },
  d7: () => [new Date(Date.now()-6*86400000), new Date()],
  d30: () => [new Date(Date.now()-29*86400000), new Date()],
  month: () => { const now=new Date(); return [new Date(now.getFullYear(),now.getMonth(),1), now] },
  previous: () => { const now=new Date(); return [new Date(now.getFullYear(),now.getMonth()-1,1), new Date(now.getFullYear(),now.getMonth(),0,23,59,59)] },
  year: () => { const now=new Date(); return [new Date(now.getFullYear(),0,1), now] },
}

function MiniBars({ series = [], keyName = 'sales_usd', formatter = value => value }) {
  const max = Math.max(1, ...series.map(row => Number(row[keyName] || 0)))
  if (!series.length) return <Empty>Aucune donnée sur la période.</Empty>
  return <div className="mini-bars">{series.map((row,index) => <div className="mini-bar" key={`${row.date}-${index}`} title={`${new Date(row.date).toLocaleDateString('fr-FR')} · ${formatter(row[keyName])}`}><span style={{height:`${Math.max(5,(Number(row[keyName]||0)/max)*100)}%`}}/><small>{new Date(row.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</small></div>)}</div>
}

export default function DashboardPage() {
  const { can, staff } = useAuth()
  const superAdmin = staff?.staff_role === 'SUPER_ADMIN'
  const allowed = permission => superAdmin || can(permission)
  const canFinance = allowed('finance.view')
  const [range, setRange] = useState('d30')
  const [custom, setCustom] = useState({ from:'', to:'' })
  const dates = useMemo(() => {
    if (range === 'custom' && custom.from && custom.to) return [new Date(`${custom.from}T00:00:00`), new Date(`${custom.to}T23:59:59`)]
    return (RANGES[range] || RANGES.d30)()
  }, [range, custom])

  const { data, loading, error } = useLoad(async () => {
    if (canFinance) {
      const { data, error } = await supabase.rpc('erp_finance_dashboard', { p_from: dates[0].toISOString(), p_to: dates[1].toISOString() })
      if (error) throw error
      return { mode:'finance', ...(data || { metrics:{}, series:[], top_stores:[], payment_methods:[] }) }
    }
    const queries = []
    const names = []
    const add = (name, query) => { names.push(name); queries.push(query) }
    if (allowed('users.view')) add('users', supabase.from('profiles').select('id', { count:'exact', head:true }))
    if (allowed('sellers.view')) add('sellerPending', supabase.from('seller_applications').select('id', { count:'exact', head:true }).in('status',['pending','under_review','needs_information']))
    if (allowed('stores.view')) add('stores', supabase.from('stores').select('id', { count:'exact', head:true }).eq('status','active'))
    if (allowed('products.view')) add('products', supabase.from('products').select('id', { count:'exact', head:true }).eq('is_active',true))
    if (allowed('orders.view')) add('orders', supabase.from('orders').select('id', { count:'exact', head:true }))
    if (allowed('support.view')) { add('tickets', supabase.from('support_tickets').select('id',{count:'exact',head:true}).in('status',['open','in_progress','escalated'])); add('urgent', supabase.from('support_tickets').select('id',{count:'exact',head:true}).eq('priority','urgent').neq('status','closed')) }
    const results = await Promise.all(queries)
    results.forEach(result => { if (result.error) throw result.error })
    return { mode:'operations', counts:Object.fromEntries(results.map((result,index)=>[names[index],result.count||0])) }
  }, [canFinance, staff?.staff_role, dates[0]?.toISOString(), dates[1]?.toISOString()])

  if (loading) return <Loader/>
  if (data?.mode === 'operations') {
    const counts = data.counts || {}
    const alerts = [counts.sellerPending ? `${counts.sellerPending} dossier(s) vendeur à examiner` : null, counts.urgent ? `${counts.urgent} ticket(s) urgent(s)` : null].filter(Boolean)
    return <>
      <SectionHead eyebrow="Vue d’ensemble" title={`Bonjour, ${staff?.full_name?.split(' ')[0] || 'Équipe'}`} desc="Les indicateurs affichés correspondent à vos responsabilités ERP."/>
      {error && <div className="alert bad">{error}</div>}
      <div className="metrics-grid">
        {allowed('users.view') && <Metric icon={Users} label="Utilisateurs" value={counts.users||0}/>} 
        {allowed('sellers.view') && <Metric icon={BadgeCheck} label="Vendeurs à examiner" value={counts.sellerPending||0}/>} 
        {allowed('stores.view') && <Metric icon={Store} label="Boutiques actives" value={counts.stores||0}/>} 
        {allowed('products.view') && <Metric icon={ShoppingBag} label="Produits actifs" value={counts.products||0}/>} 
        {allowed('orders.view') && <Metric icon={Package} label="Commandes" value={counts.orders||0}/>} 
        {allowed('support.view') && <Metric icon={Headphones} label="Tickets ouverts" value={counts.tickets||0} sub={`${counts.urgent||0} urgents`}/>} 
      </div>
      <div className="dashboard-columns"><section className="panel"><div className="panel-head"><div><AlertTriangle size={18}/><strong>À surveiller</strong></div></div>{alerts.length ? alerts.map((alert,index)=><div className="line-item" key={index}><span>{alert}</span></div>) : <Empty>Aucune alerte prioritaire.</Empty>}</section><section className="panel"><div className="panel-head"><div><Zap size={18}/><strong>Actions rapides</strong></div></div>{allowed('sellers.view')&&<NavLink className="line-item" to="/sellers"><span>Examiner les vendeurs</span></NavLink>}{allowed('orders.view')&&<NavLink className="line-item" to="/orders"><span>Voir les commandes</span></NavLink>}{allowed('support.view')&&<NavLink className="line-item" to="/support"><span>Voir les signalements</span></NavLink>}</section></div>
    </>
  }

  const m = data?.metrics || {}
  return <>
    <SectionHead eyebrow="Vue d’ensemble" title={`Bonjour, ${staff?.full_name?.split(' ')[0] || 'DG'}`} desc="Pilotage commercial et financier de One Market."/>
    <div className="period-toolbar">{[["today","Aujourd’hui"],["d7","7 jours"],["d30","30 jours"],["month","Ce mois"],["previous","Mois précédent"],["year","Cette année"],["custom","Personnalisée"]].map(([value,label]) => <button key={value} className={range===value?'active':''} onClick={() => setRange(value)}>{label}</button>)}{range==='custom' && <div className="period-custom"><input type="date" value={custom.from} onChange={e=>setCustom({...custom,from:e.target.value})}/><span>→</span><input type="date" value={custom.to} onChange={e=>setCustom({...custom,to:e.target.value})}/></div>}</div>
    {error && <div className="alert bad">{error}</div>}
    <div className="metrics-grid"><Metric icon={ShoppingBag} label="GMV" value={usd(m.gmv_usd)} sub={`${m.orders||0} commandes`}/><Metric icon={Package} label="Livrées" value={m.delivered_orders||0} sub={`Panier moyen ${usd(m.average_order_usd)}`}/><Metric icon={Store} label="Boutiques actives" value={m.active_stores||0} sub={`${m.new_sellers||0} nouveaux vendeurs`}/><Metric icon={Users} label="Nouveaux clients" value={m.new_customers||0}/><Metric icon={CircleDollarSign} label="Commissions générées" value={usd(m.commissions_generated_usd)} sub={`encaissées ${usd(m.commissions_collected_usd)}`}/><Metric icon={WalletCards} label="À reverser vendeurs" value={usd(m.seller_due_usd)} sub={`${m.payouts_pending||0} payout(s) en attente`}/><Metric icon={Banknote} label="Abonnements" value={cdf(m.subscription_revenue_cdf)} sub="revenus sur la période"/><Metric icon={Zap} label="Livraison" value={cdf(m.delivery_revenue_cdf)} sub={`${m.cod_pending||0} COD à encaisser`}/></div>
    <div className="dashboard-columns"><section className="panel chart-panel"><div className="panel-head"><div><strong>Ventes dans le temps</strong></div></div><MiniBars series={data?.series||[]} keyName="sales_usd" formatter={usd}/></section><section className="panel"><div className="panel-head"><div><strong>Meilleures boutiques</strong></div></div>{(data?.top_stores||[]).length ? data.top_stores.map((store,index)=><div className="line-item" key={store.store_id}><span><strong>{index+1}. {store.name}</strong><small>Commission {usd(store.commissions_usd)}</small></span><strong>{usd(store.sales_usd)}</strong></div>) : <Empty/>}</section></div>
    <div className="dashboard-columns"><section className="panel"><h3>Paiements</h3><div className="finance-status-grid"><div><span>COD à encaisser</span><strong>{m.cod_pending||0}</strong></div><div><span>Mobile Money soumis</span><strong>{m.mobile_pending||0}</strong></div><div><span>Mobile Money confirmés</span><strong>{m.mobile_paid||0}</strong></div><div><span>Problèmes</span><strong>{m.payment_problems||0}</strong></div></div></section><section className="panel"><h3>Vendeurs</h3><div className="finance-status-grid"><div><span>Dû aux boutiques</span><strong>{usd(m.seller_due_usd)}</strong></div><div><span>Déjà payé</span><strong>{usd(m.seller_paid_usd)}</strong></div><div><span>Payouts en attente</span><strong>{m.payouts_pending||0}</strong></div><div><span>Commission encaissée</span><strong>{usd(m.commissions_collected_usd)}</strong></div></div></section></div>
  </>
}
