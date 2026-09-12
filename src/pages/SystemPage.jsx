import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime } from '../lib/format'
import { ROLE_LABELS } from '../lib/roles'
import { useLoad } from '../lib/useLoad'
import { Badge, Loader, SectionHead, Table } from '../components/UI'

export function StaffPage() {
  const { staff } = useAuth()
  const { data, loading, reload } = useLoad(async () => {
    const { data: staffRows, error } = await supabase.from('admin_staff').select('*').order('created_at')
    if (error) throw error
    const { data: users } = await supabase.rpc('erp_list_users', { p_search: null, p_limit: 200, p_offset: 0 })
    const userMap = Object.fromEntries((users || []).map(user => [user.id, user]))
    return (staffRows || []).map(row => ({ ...row, email: userMap[row.user_id]?.email }))
  }, [])

  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>

  async function edit(row) {
    const role = window.prompt('Rôle ERP : SUPER_ADMIN / ACCOUNTANT / MODERATOR / CUSTOMER_SERVICE / OPERATIONS_MANAGER', row.staff_role)
    if (!role) return
    const status = window.prompt('Statut : active / suspended', row.status)
    if (!status) return
    const { error } = await supabase.rpc('erp_manage_staff', { p_user_id: row.user_id, p_staff_role: role, p_status: status })
    if (error) window.alert(error.message)
    else reload()
  }

  return <>
    <SectionHead eyebrow="Système" title="Employés ERP" desc="Accès internes et rôles One Market."/>
    {loading ? <Loader/> : <Table headers={['Employé','Rôle','Statut','Dernière connexion','Ajout','']} rows={(data || []).map(row => [
      <div><strong>{row.full_name || '—'}</strong><span>{row.email || row.user_id}</span></div>,
      ROLE_LABELS[row.staff_role] || row.staff_role,
      <Badge value={row.status}/>,
      dateTime(row.last_login_at),
      dateTime(row.created_at),
      <button className="row-action" type="button" onClick={() => edit(row)}>Modifier</button>,
    ])}/>} 
  </>
}

export function AuditPage() {
  const { staff } = useAuth()
  const { data, loading } = useLoad(async () => {
    const { data: logs, error } = await supabase.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) throw error
    return logs || []
  }, [])

  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>

  return <>
    <SectionHead eyebrow="Système" title="Journal d’activité" desc="Traçabilité des actions administratives sensibles."/>
    {loading ? <Loader/> : <Table headers={['Action','Entité','ID','Employé','Date']} rows={(data || []).map(log => [log.action, log.entity_type, log.entity_id || '—', log.staff_user_id.slice(0, 8), dateTime(log.created_at)])}/>} 
  </>
}

export function SettingsPage() {
  const { staff } = useAuth()
  const { data, loading, reload } = useLoad(async () => {
    const { data: methods, error } = await supabase.from('delivery_methods').select('*').order('sort_order')
    if (error) throw error
    return methods || []
  }, [])

  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>

  async function edit(method) {
    const fee = Number(window.prompt('Nouveau tarif en FC :', method.fee_cdf))
    if (!Number.isFinite(fee) || fee < 0) return
    const { error } = await supabase.rpc('erp_update_delivery_method', { p_code: method.code, p_fee_cdf: fee, p_active: method.is_active })
    if (!error) reload()
  }

  return <>
    <SectionHead eyebrow="Système" title="Paramètres" desc="Réglages opérationnels de la marketplace."/>
    {loading ? <Loader/> : <section className="panel"><h3>Tarifs de livraison</h3>{data.map(method => <div className="line-item" key={method.code}><span><strong>{method.label}</strong><small>{method.description}</small></span><div className="button-row compact"><strong>{cdf(method.fee_cdf)}</strong><button className="btn ghost" type="button" onClick={() => edit(method)}>Modifier</button></div></div>)}</section>}
  </>
}
