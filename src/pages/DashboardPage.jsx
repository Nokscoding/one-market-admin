import { AlertTriangle, BadgeCheck, Headphones, Package, ShoppingBag, Store, Truck, Users, Zap } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { Empty, Loader, Metric, SectionHead } from '../components/UI'

export default function DashboardPage() {
  const { can, staff } = useAuth()
  const superAdmin = staff?.staff_role === 'SUPER_ADMIN'
  const allowed = permission => superAdmin || can(permission)

  const { data, loading } = useLoad(async () => {
    const queries = []
    const names = []
    const add = (name, query) => { names.push(name); queries.push(query) }

    if (allowed('users.view')) add('users', supabase.from('profiles').select('*', { count: 'exact', head: true }))
    if (allowed('sellers.view')) add('sellerPending', supabase.from('seller_applications').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review', 'needs_information']))
    if (allowed('stores.view')) {
      add('stores', supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'))
      add('verified', supabase.from('stores').select('*', { count: 'exact', head: true }).eq('is_verified', true))
      add('partners', supabase.from('stores').select('*', { count: 'exact', head: true }).eq('is_partner', true))
    }
    if (allowed('products.view')) add('products', supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true))
    if (allowed('orders.view')) {
      add('orders', supabase.from('orders').select('*', { count: 'exact', head: true }))
      add('express', supabase.from('orders').select('*', { count: 'exact', head: true }).eq('delivery_method', 'express').neq('status', 'delivered'))
    }
    if (allowed('support.view')) {
      add('tickets', supabase.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'escalated']))
      add('urgent', supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('priority', 'urgent').neq('status', 'closed'))
    }

    const results = await Promise.all(queries)
    return Object.fromEntries(results.map((result, index) => [names[index], result.count || 0]))
  }, [staff?.staff_role])

  if (loading) return <Loader/>

  const alerts = [
    data?.sellerPending ? `${data.sellerPending} dossier(s) vendeur à examiner` : null,
    data?.urgent ? `${data.urgent} ticket(s) urgent(s)` : null,
    data?.express ? `${data.express} livraison(s) express en cours` : null,
  ].filter(Boolean)

  return <>
    <SectionHead eyebrow="Vue d’ensemble" title={`Bonjour, ${staff?.full_name?.split(' ')[0] || 'DG'}`} desc="Données réelles de la marketplace One Market."/>
    <div className="metrics-grid">
      {allowed('users.view') && <Metric icon={Users} label="Utilisateurs" value={data?.users || 0}/>} 
      {allowed('sellers.view') && <Metric icon={BadgeCheck} label="Vendeurs à examiner" value={data?.sellerPending || 0}/>} 
      {allowed('stores.view') && <Metric icon={Store} label="Boutiques actives" value={data?.stores || 0} sub={`${data?.verified || 0} vérifiées · ${data?.partners || 0} partenaires`}/>} 
      {allowed('products.view') && <Metric icon={ShoppingBag} label="Produits actifs" value={data?.products || 0}/>} 
      {allowed('orders.view') && <Metric icon={Package} label="Commandes" value={data?.orders || 0} sub={`${data?.express || 0} express en cours`}/>} 
      {allowed('support.view') && <Metric icon={Headphones} label="Tickets ouverts" value={data?.tickets || 0} sub={`${data?.urgent || 0} urgents`}/>} 
    </div>

    <div className="dashboard-columns">
      <section className="panel">
        <div className="panel-head"><div><AlertTriangle size={18}/><strong>À surveiller</strong></div></div>
        {alerts.length ? alerts.map((alert, index) => <div className="line-item" key={index}><span>{alert}</span></div>) : <Empty>Aucune alerte prioritaire.</Empty>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><Zap size={18}/><strong>Actions rapides</strong></div></div>
        {allowed('sellers.view') && <NavLink className="line-item" to="/sellers"><span>Examiner les vendeurs</span></NavLink>}
        {allowed('orders.view') && <NavLink className="line-item" to="/orders"><span>Voir les commandes</span></NavLink>}
        {allowed('support.view') && <NavLink className="line-item" to="/support"><span>Voir les signalements</span></NavLink>}
        {allowed('finance.view') && <NavLink className="line-item" to="/finance"><span>Consulter les finances</span></NavLink>}
      </section>
    </div>
  </>
}
