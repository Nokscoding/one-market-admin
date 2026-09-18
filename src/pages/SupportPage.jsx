import { adminUserError } from '../lib/userErrors'
import { useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dateTime, TICKET_LABELS } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Empty, Info, Loader, SearchBar, SectionHead, Table } from '../components/UI'

function reporterLabel(ticket){return ticket.reporter_name||ticket.reporter_email||ticket.user_id?.slice(0,8)||'Utilisateur'}

export function SupportPage(){
  const [filter,setFilter]=useState('open'); const [search,setSearch]=useState('')
  const {data,loading,error}=useLoad(async()=>{const {data,error}=await supabase.rpc('erp_support_tickets',{p_status:filter==='all'?null:filter,p_ticket_id:null,p_limit:250});if(error)throw error;return data||[]},[filter])
  const visible=useMemo(()=>(data||[]).filter(t=>!search||`${t.ticket_number||''} ${reporterLabel(t)} ${t.subject||''} ${t.category||''}`.toLowerCase().includes(search.toLowerCase())),[data,search])
  const counts=useMemo(()=>({urgent:(data||[]).filter(t=>t.priority==='urgent').length,waiting:(data||[]).filter(t=>t.status==='waiting_customer').length}),[data])
  return <>
    <SectionHead eyebrow="Service client" title="Signalements" desc="Tickets clients et vendeurs, priorités, contexte commande et escalades."/>
    <div className="support-summary"><span>Urgents <strong>{counts.urgent}</strong></span><span>Attente client <strong>{counts.waiting}</strong></span><span>Affichés <strong>{visible.length}</strong></span></div>
    <SearchBar value={search} onChange={setSearch} placeholder="Ticket, client, sujet ou catégorie"/>
    <div className="filter-row">{['open','in_progress','waiting_customer','escalated','resolved','closed','all'].map(status=><button type="button" className={filter===status?'active':''} onClick={()=>setFilter(status)} key={status}>{status==='all'?'Tous':TICKET_LABELS[status]}</button>)}</div>
    {error&&<div className="alert bad">{error}</div>}
    {loading?<Loader/>:<Table headers={['Ticket','Plaignant','Sujet','Catégorie','Priorité','Statut','Date','']} rows={visible.map(ticket=>[
      ticket.ticket_number||ticket.id.slice(0,8),<div><strong>{reporterLabel(ticket)}</strong><span>{ticket.reporter_role||ticket.reporter_marketplace_role||'client'} · {ticket.reporter_phone||ticket.reporter_profile_phone||'sans téléphone'}</span></div>,ticket.subject,ticket.category,<Badge value={ticket.priority}/>,<Badge value={ticket.status} label={TICKET_LABELS[ticket.status]}/>,dateTime(ticket.created_at),<NavLink className="row-link" to={`/support/${ticket.id}`}>Traiter</NavLink>
    ])}/>} 
  </>
}

export function TicketDetailPage(){
  const {id}=useParams(); const [message,setMessage]=useState(''); const [internal,setInternal]=useState(false); const [statusModal,setStatusModal]=useState(null); const [resolution,setResolution]=useState(''); const [actionError,setActionError]=useState('')
  const {data,loading,reload}=useLoad(async()=>{const [{data:tickets,error},{data:messages,error:messageError}]=await Promise.all([supabase.rpc('erp_support_tickets',{p_status:null,p_ticket_id:id,p_limit:1}),supabase.from('support_ticket_messages').select('*').eq('ticket_id',id).order('created_at')]);if(error)throw error;if(messageError)throw messageError;return{ticket:tickets?.[0]||null,messages:messages||[]}},[id])
  if(loading)return <Loader/>; if(!data?.ticket)return <Empty>Ticket introuvable.</Empty>; const ticket=data.ticket
  async function reply(){if(!message.trim())return;setActionError('');const {error}=await supabase.rpc('erp_reply_support_ticket',{p_ticket_id:id,p_message:message,p_internal:internal});if(error)return setActionError(adminUserError(error));setMessage('');reload()}
  function openStatus(status){setResolution('');setStatusModal(status)}
  async function saveStatus(){setActionError('');const {error}=await supabase.rpc('erp_update_support_ticket',{p_ticket_id:id,p_status:statusModal,p_priority:null,p_assigned_to:null,p_department:null,p_resolution:statusModal==='resolved'?(resolution||'Résolu'):null,p_escalated_to:null});if(error)return setActionError(adminUserError(error));setStatusModal(null);reload()}
  async function escalate(target){setActionError('');const department=target==='MODERATION'?'MODERATION':target==='OPERATIONS'?'OPERATIONS':'ACCOUNTING';const {error}=await supabase.rpc('erp_update_support_ticket',{p_ticket_id:id,p_status:'escalated',p_priority:null,p_assigned_to:null,p_department:department,p_resolution:null,p_escalated_to:target});if(error)return setActionError(adminUserError(error));reload()}
  return <>
    <SectionHead eyebrow="Ticket support" title={ticket.ticket_number||'Signalement'} desc={ticket.subject}/>
    {actionError&&<div className="alert bad">{actionError}</div>}
    <div className="detail-grid"><section className="panel detail-card"><h3>Plaignant</h3><Info label="Nom" value={<NavLink to={`/users/${ticket.user_id}`}>{reporterLabel(ticket)}</NavLink>}/><Info label="Rôle" value={ticket.reporter_role||ticket.reporter_marketplace_role||'client'}/><Info label="Téléphone" value={ticket.reporter_phone||ticket.reporter_profile_phone||'—'}/><Info label="Email" value={ticket.reporter_email||'—'}/></section><section className="panel detail-card"><h3>Détails</h3><Info label="Statut" value={<Badge value={ticket.status} label={TICKET_LABELS[ticket.status]}/>}/><Info label="Priorité" value={ticket.priority}/><Info label="Catégorie" value={ticket.category}/><Info label="Source" value={ticket.source}/><Info label="Créé" value={dateTime(ticket.created_at)}/><Info label="Message" value={ticket.message}/></section><section className="panel detail-card"><h3>Contexte</h3><Info label="Commande" value={ticket.order_id?<NavLink to={`/orders/${ticket.order_id}`}>Ouvrir</NavLink>:'—'}/><Info label="Boutique" value={ticket.store_id||'—'}/><Info label="Produit" value={ticket.product_id||'—'}/><Info label="Département" value={ticket.assigned_department||'—'}/><div className="button-row"><button className="btn ghost" onClick={()=>openStatus('in_progress')}>Prendre en charge</button><button className="btn primary" onClick={()=>openStatus('resolved')}>Résoudre</button><button className="btn ghost" onClick={()=>openStatus('closed')}>Fermer</button></div></section></div>
    <section className="panel"><h3>Escalader</h3><div className="button-row"><button className="btn ghost" onClick={()=>escalate('MODERATION')}>Vers modération</button><button className="btn ghost" onClick={()=>escalate('OPERATIONS')}>Vers opérations</button><button className="btn ghost" onClick={()=>escalate('ACCOUNTING')}>Vers comptabilité</button></div></section>
    <section className="panel"><h3>Historique des réponses</h3><div className="support-thread">{data.messages.length?data.messages.map(item=><article key={item.id} className={item.is_internal?'internal':''}><div><strong>{item.is_internal?'Note interne':'Réponse'}</strong><small>{dateTime(item.created_at)}</small></div><p>{item.message}</p></article>):<Empty/>}</div><div className="reply-box"><textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Écrire une réponse…"/><label className="checkbox"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/><span>Note interne uniquement</span></label><button className="btn primary" onClick={reply}>Envoyer</button></div></section>
    <ConfirmModal open={!!statusModal} title={statusModal==='resolved'?'Résoudre le ticket':statusModal==='closed'?'Fermer le ticket':'Prendre en charge'} onClose={()=>setStatusModal(null)} onConfirm={saveStatus}>{statusModal==='resolved'&&<label>Résolution<textarea rows={4} value={resolution} onChange={e=>setResolution(e.target.value)} placeholder="Explique la résolution apportée"/></label>}</ConfirmModal>
  </>
}

export function ConversationsPage(){
  const {data,loading,error}=useLoad(async()=>{const {data,error}=await supabase.from('conversations').select('*').order('updated_at',{ascending:false}).limit(100);if(error)throw error;return data||[]},[])
  return <><SectionHead eyebrow="Service client" title="Conversations" desc="Accès encadré aux discussions liées aux commandes."/>{error&&<div className="alert bad">{error}</div>}{loading?<Loader/>:<div className="cards-list">{data?.length?data.map(c=><article className="store-row" key={c.id}><MessageSquare size={20}/><div className="grow"><strong>Conversation {c.id.slice(0,8)}</strong><span>Commande vendeur {c.seller_order_id?.slice(0,8)||'—'}</span></div><span>{dateTime(c.updated_at)}</span></article>):<Empty/>}</div>}</>
}
