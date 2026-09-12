import { useEffect, useState } from 'react'
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
    if (error) window.alert(error.message === 'CLIENT_CANNOT_BE_SUPER_ADMIN' ? 'Un compte client ne peut pas devenir DG / Super Admin. Change d’abord son rôle marketplace.' : error.message)
    else reload()
  }

  return <>
    <SectionHead eyebrow="Système" title="Employés ERP" desc="Accès internes et rôles One Market. Le DG / Super Admin dispose de toutes les permissions."/>
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
    const [{ data: methods, error }, { data: settings, error: settingError }] = await Promise.all([
      supabase.from('delivery_methods').select('*').order('sort_order'),
      supabase.from('marketplace_settings').select('*').in('key', ['payments','commerce']),
    ])
    if (error) throw error
    if (settingError) throw settingError
    const map = Object.fromEntries((settings || []).map(row => [row.key, row.value || {}]))
    return { methods: methods || [], payments: map.payments || {}, commerce: map.commerce || {} }
  }, [])
  const [payments, setPayments] = useState(null)
  const [commerce, setCommerce] = useState(null)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    if (!data) return
    setPayments({
      cod_enabled: data.payments.cod_enabled !== false,
      mobile_money_enabled: data.payments.mobile_money_enabled === true,
      mobile_money_whatsapp: data.payments.mobile_money_whatsapp || '243995585991',
      mobile_money_display: data.payments.mobile_money_display || '0995585991',
    })
    setCommerce({
      default_commission_percent: Number(data.commerce.default_commission_percent || 0),
      store_boost_enabled: data.commerce.store_boost_enabled === true,
    })
  }, [data])

  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>

  async function editDelivery(method) {
    const fee = Number(window.prompt('Nouveau tarif en FC :', method.fee_cdf))
    if (!Number.isFinite(fee) || fee < 0) return
    const active = window.confirm(`${method.label} doit-il rester actif ?`)
    const { error } = await supabase.rpc('erp_update_delivery_method', { p_code: method.code, p_fee_cdf: Math.round(fee), p_active: active })
    if (error) window.alert(error.message)
    else reload()
  }

  async function saveSetting(key, value) {
    setSaving(key)
    const { error } = await supabase.rpc('erp_update_marketplace_setting', { p_key: key, p_value: value })
    if (error) window.alert(error.message)
    else reload()
    setSaving('')
  }

  return <>
    <SectionHead eyebrow="Système" title="Paramètres" desc="Le DG pilote ici les réglages commerciaux et opérationnels de One Market."/>
    {loading || !payments || !commerce ? <Loader/> : <>
      <div className="detail-grid">
        <section className="panel settings-form"><h3>Moyens de paiement</h3><p className="settings-help">Activez les moyens proposés au checkout. Mobile Money redirige le client vers WhatsApp.</p>
          <label className="checkbox"><input type="checkbox" checked={payments.cod_enabled} onChange={event => setPayments({ ...payments, cod_enabled: event.target.checked })}/><span>Paiement à la livraison actif</span></label>
          <label className="checkbox"><input type="checkbox" checked={payments.mobile_money_enabled} onChange={event => setPayments({ ...payments, mobile_money_enabled: event.target.checked })}/><span>Mobile Money actif</span></label>
          <div className="form-grid"><label>Numéro WhatsApp international<input value={payments.mobile_money_whatsapp} onChange={event => setPayments({ ...payments, mobile_money_whatsapp: event.target.value })} placeholder="243995585991"/></label><label>Numéro affiché<input value={payments.mobile_money_display} onChange={event => setPayments({ ...payments, mobile_money_display: event.target.value })} placeholder="0995585991"/></label></div>
          <button className="btn primary" type="button" disabled={saving === 'payments'} onClick={() => saveSetting('payments', payments)}>{saving === 'payments' ? 'Enregistrement…' : 'Enregistrer les paiements'}</button>
        </section>

        <section className="panel settings-form"><h3>Commission & commerce</h3><p className="settings-help">La commission par défaut s’applique comme référence globale. Une boutique peut avoir un pourcentage spécifique depuis la page Boutiques.</p>
          <label>Commission par défaut (%)<input type="number" min="0" max="100" step="0.01" value={commerce.default_commission_percent} onChange={event => setCommerce({ ...commerce, default_commission_percent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}/></label>
          <label className="checkbox"><input type="checkbox" checked={commerce.store_boost_enabled} onChange={event => setCommerce({ ...commerce, store_boost_enabled: event.target.checked })}/><span>Autoriser la mise en avant payante des boutiques</span></label>
          <button className="btn primary" type="button" disabled={saving === 'commerce'} onClick={() => saveSetting('commerce', commerce)}>{saving === 'commerce' ? 'Enregistrement…' : 'Enregistrer les règles commerciales'}</button>
        </section>
      </div>

      <section className="panel"><h3>Tarifs de livraison</h3>{data.methods.map(method => <div className="line-item" key={method.code}><span><strong>{method.label}</strong><small>{method.description} · {method.is_active ? 'Actif' : 'Inactif'}</small></span><div className="button-row compact"><strong>{cdf(method.fee_cdf)}</strong><button className="btn ghost" type="button" onClick={() => editDelivery(method)}>Modifier</button></div></div>)}</section>
    </>}
  </>
}
