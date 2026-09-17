import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime } from '../lib/format'
import { ROLE_LABELS, STAFF_ROLES } from '../lib/roles'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Loader, SearchBar, SectionHead, Table } from '../components/UI'

export function StaffPage() {
  const { staff } = useAuth()
  const [editRow, setEditRow] = useState(null)
  const [form, setForm] = useState({ role:'', status:'active' })
  const [actionError, setActionError] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const { data: staffRows, error } = await supabase.from('admin_staff').select('*').order('created_at')
    if (error) throw error
    const { data: users, error: userError } = await supabase.rpc('erp_list_users', { p_search: null, p_limit: 250, p_offset: 0 })
    if (userError) throw userError
    const map = Object.fromEntries((users || []).map(user => [user.id, user]))
    return (staffRows || []).map(row => ({ ...row, email: map[row.user_id]?.email }))
  }, [])
  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>
  function openEdit(row){ setActionError(''); setEditRow(row); setForm({role:row.staff_role,status:row.status}) }
  async function save(){ setActionError(''); const {error}=await supabase.rpc('erp_manage_staff',{p_user_id:editRow.user_id,p_staff_role:form.role,p_status:form.status}); if(error)return setActionError(error.message==='CLIENT_CANNOT_BE_SUPER_ADMIN'?'Un compte client ne peut pas devenir DG / Super Admin.':error.message); setEditRow(null); reload() }
  return <>
    <SectionHead eyebrow="Système" title="Employés ERP" desc="Rôles, accès internes et dernière activité du personnel One Market."/>
    {(error||actionError)&&<div className="alert bad">{error||actionError}</div>}
    {loading?<Loader/>:<Table headers={['Employé','Rôle','Statut','Dernière connexion','Ajout','']} rows={(data||[]).map(row=>[
      <div><strong>{row.full_name||'—'}</strong><span>{row.email||row.user_id}</span></div>, ROLE_LABELS[row.staff_role]||row.staff_role, <Badge value={row.status}/>, dateTime(row.last_login_at), dateTime(row.created_at), <button className="row-action" onClick={()=>openEdit(row)}>Modifier</button>
    ])}/>} 
    <ConfirmModal open={!!editRow} title="Modifier l’accès ERP" text={editRow?.full_name||editRow?.email} onClose={()=>setEditRow(null)} onConfirm={save}><div className="form-grid"><label>Rôle<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{STAFF_ROLES.map(role=><option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select></label><label>Statut<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Actif</option><option value="suspended">Suspendu</option></select></label></div></ConfirmModal>
  </>
}

export function AuditPage() {
  const { staff } = useAuth()
  const [search,setSearch]=useState('')
  const [entity,setEntity]=useState('')
  const {data,loading,error}=useLoad(async()=>{const {data,error}=await supabase.from('admin_audit_logs').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw error;return data||[]},[])
  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>
  const visible=useMemo(()=>(data||[]).filter(log=>(!search||`${log.action} ${log.entity_type} ${log.entity_id||''} ${log.staff_user_id||''}`.toLowerCase().includes(search.toLowerCase()))&&(!entity||log.entity_type===entity)),[data,search,entity])
  const entities=[...new Set((data||[]).map(log=>log.entity_type).filter(Boolean))]
  return <>
    <SectionHead eyebrow="Système" title="Journal d’activité" desc="Traçabilité des actions sensibles, financières et administratives."/>
    <div className="toolbar-row"><SearchBar value={search} onChange={setSearch} placeholder="Action, ressource ou identifiant"/><select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Toutes les ressources</option>{entities.map(v=><option key={v}>{v}</option>)}</select></div>
    {error&&<div className="alert bad">{error}</div>}
    {loading?<Loader/>:<Table headers={['Action','Ressource','ID','Employé','Avant','Après','Date']} rows={visible.map(log=>[log.action,log.entity_type,log.entity_id||'—',log.staff_user_id?.slice(0,8)||'—',log.before_data?<code className="audit-json">{JSON.stringify(log.before_data).slice(0,90)}</code>:'—',log.after_data?<code className="audit-json">{JSON.stringify(log.after_data).slice(0,90)}</code>:'—',dateTime(log.created_at)])}/>} 
  </>
}

export function SettingsPage() {
  const { staff } = useAuth()
  const [payments,setPayments]=useState(null)
  const [commerce,setCommerce]=useState(null)
  const [deliveryModal,setDeliveryModal]=useState(null)
  const [deliveryForm,setDeliveryForm]=useState({fee:0,active:true})
  const [saving,setSaving]=useState('')
  const [notice,setNotice]=useState('')
  const [actionError,setActionError]=useState('')
  const {data,loading,error,reload}=useLoad(async()=>{const [{data:methods,error:methodError},{data:settings,error:settingError}]=await Promise.all([supabase.from('delivery_methods').select('*').order('sort_order'),supabase.from('marketplace_settings').select('*').in('key',['payments','commerce'])]);if(methodError)throw methodError;if(settingError)throw settingError;const map=Object.fromEntries((settings||[]).map(row=>[row.key,row.value||{}]));return{methods:methods||[],payments:map.payments||{},commerce:map.commerce||{}}},[])
  useEffect(()=>{if(!data)return;setPayments({cod_enabled:data.payments.cod_enabled!==false,mobile_money_enabled:data.payments.mobile_money_enabled===true,mobile_money_whatsapp:data.payments.mobile_money_whatsapp||'',mobile_money_display:data.payments.mobile_money_display||''});setCommerce({default_commission_percent:Number(data.commerce.default_commission_percent||0),store_boost_enabled:data.commerce.store_boost_enabled===true})},[data])
  if(staff?.staff_role!=='SUPER_ADMIN')return <Navigate to="/403" replace/>
  async function saveSetting(key,value){setSaving(key);setActionError('');setNotice('');const {error}=await supabase.rpc('erp_update_marketplace_setting',{p_key:key,p_value:value});if(error)setActionError(error.message);else{setNotice('Paramètres enregistrés.');reload()}setSaving('')}
  function openDelivery(method){setActionError('');setDeliveryModal(method);setDeliveryForm({fee:Number(method.fee_cdf||0),active:method.is_active!==false})}
  async function saveDelivery(){const {error}=await supabase.rpc('erp_update_delivery_method',{p_code:deliveryModal.code,p_fee_cdf:Math.round(Number(deliveryForm.fee)||0),p_active:deliveryForm.active});if(error)return setActionError(error.message);setDeliveryModal(null);reload()}
  return <>
    <SectionHead eyebrow="Système" title="Paramètres" desc="Réglages marketplace, finances, paiements et livraison."/>
    {(error||actionError)&&<div className="alert bad">{error||actionError}</div>}{notice&&<div className="alert good">{notice}</div>}
    {loading||!payments||!commerce?<Loader/>:<>
      <div className="detail-grid">
        <section className="panel settings-form"><h3>Marketplace & paiements</h3><label className="checkbox"><input type="checkbox" checked={payments.cod_enabled} onChange={e=>setPayments({...payments,cod_enabled:e.target.checked})}/><span>Paiement à la livraison actif</span></label><label className="checkbox"><input type="checkbox" checked={payments.mobile_money_enabled} onChange={e=>setPayments({...payments,mobile_money_enabled:e.target.checked})}/><span>Mobile Money actif</span></label><div className="form-grid"><label>WhatsApp international<input value={payments.mobile_money_whatsapp} onChange={e=>setPayments({...payments,mobile_money_whatsapp:e.target.value})}/></label><label>Numéro affiché<input value={payments.mobile_money_display} onChange={e=>setPayments({...payments,mobile_money_display:e.target.value})}/></label></div><button className="btn primary" disabled={saving==='payments'} onClick={()=>saveSetting('payments',payments)}>{saving==='payments'?'Enregistrement…':'Enregistrer'}</button></section>
        <section className="panel settings-form"><h3>Finances</h3><p className="settings-help">Cette commission générale s’applique automatiquement à toutes les boutiques sans override spécifique.</p><label>Commission générale One Market (%)<input type="number" min="0" max="100" step="0.01" value={commerce.default_commission_percent} onChange={e=>setCommerce({...commerce,default_commission_percent:Math.max(0,Math.min(100,Number(e.target.value)||0))})}/></label><label className="checkbox"><input type="checkbox" checked={commerce.store_boost_enabled} onChange={e=>setCommerce({...commerce,store_boost_enabled:e.target.checked})}/><span>Autoriser les boosts boutiques</span></label><button className="btn primary" disabled={saving==='commerce'} onClick={()=>saveSetting('commerce',commerce)}>{saving==='commerce'?'Enregistrement…':'Enregistrer les règles financières'}</button></section>
      </div>
      <section className="panel"><h3>Livraison</h3>{data.methods.map(method=><div className="line-item" key={method.code}><span><strong>{method.label}</strong><small>{method.description} · {method.is_active?'Actif':'Inactif'}</small></span><div className="button-row compact"><strong>{cdf(method.fee_cdf)}</strong><button className="btn ghost" onClick={()=>openDelivery(method)}>Modifier</button></div></div>)}</section>
    </>}
    <ConfirmModal open={!!deliveryModal} title="Modifier la livraison" text={deliveryModal?.label} onClose={()=>setDeliveryModal(null)} onConfirm={saveDelivery}><div className="form-grid"><label>Tarif CDF<input type="number" min="0" value={deliveryForm.fee} onChange={e=>setDeliveryForm({...deliveryForm,fee:e.target.value})}/></label><label className="checkbox"><input type="checkbox" checked={deliveryForm.active} onChange={e=>setDeliveryForm({...deliveryForm,active:e.target.checked})}/><span>Service actif</span></label></div></ConfirmModal>
  </>
}
