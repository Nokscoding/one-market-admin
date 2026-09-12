import { useState } from 'react'
import { FileText } from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SELLER_LABELS, dateTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Empty, Info, Loader, SectionHead, Table } from '../components/UI'

export function SellersPage() {
  const [filter, setFilter] = useState('pending')
  const { data, loading } = useLoad(async () => {
    let query = supabase.from('seller_applications').select('*').order('submitted_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data: applications, error } = await query
    if (error) throw error
    const ids = [...new Set((applications || []).map(item => item.user_id))]
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name,phone').in('id', ids) : { data: [] }
    const profileMap = Object.fromEntries((profiles || []).map(profile => [profile.id, profile]))
    return (applications || []).map(application => ({ ...application, profile: profileMap[application.user_id] }))
  }, [filter])

  return <>
    <SectionHead eyebrow="Marketplace" title="Validation vendeurs" desc="Identité, activité, documents et décision One Market."/>
    <div className="filter-row">{['pending','under_review','needs_information','approved','rejected','suspended','all'].map(status => <button type="button" className={filter === status ? 'active' : ''} onClick={() => setFilter(status)} key={status}>{status === 'all' ? 'Tous' : SELLER_LABELS[status]}</button>)}</div>
    {loading ? <Loader/> : <Table headers={['Activité','Type','Candidat','Ville','Statut','Soumis','']} rows={(data || []).map(application => [
      application.business_name,
      application.seller_type,
      application.profile?.full_name || '—',
      application.city,
      <Badge value={application.status} label={SELLER_LABELS[application.status]}/>,
      dateTime(application.submitted_at),
      <NavLink className="row-link" to={`/sellers/${application.id}`}>Examiner</NavLink>,
    ])}/>} 
  </>
}

export function SellerDetailPage() {
  const { id } = useParams()
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const { data: application, error } = await supabase.from('seller_applications').select('*').eq('id', id).single()
    if (error) throw error
    const [{ data: profile }, { data: documents }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', application.user_id).maybeSingle(),
      supabase.from('seller_application_documents').select('*').eq('application_id', id).order('created_at'),
    ])
    return { application, profile, documents: documents || [] }
  }, [id])

  if (loading) return <Loader/>
  if (!data?.application) return <Empty>Dossier vendeur introuvable.</Empty>

  const application = data.application

  async function review(nextAction) {
    const { error } = await supabase.rpc('erp_review_seller_application', { p_application_id: id, p_action: nextAction, p_note: note || null })
    if (!error) { setAction(null); setNote(''); reload() }
  }

  async function openDocument(document) {
    const { data: signed, error } = await supabase.storage.from('seller-legal-documents').createSignedUrl(document.storage_path, 120)
    if (!error && signed?.signedUrl) window.open(signed.signedUrl, '_blank', 'noopener')
  }

  const socialLinks = [
    ['Site', application.website_url], ['Instagram', application.instagram_url], ['TikTok', application.tiktok_url],
    ['Facebook', application.facebook_url], ['LinkedIn', application.linkedin_url], ['WhatsApp', application.whatsapp_business],
    ['Marketplace', application.marketplace_url], ['Autre', application.other_social_url],
  ].filter(([, value]) => value)

  return <>
    <SectionHead eyebrow="Dossier vendeur" title={application.business_name} desc={`${application.seller_type} · ${application.city}`}/>
    <div className="detail-grid">
      <section className="panel detail-card"><h3>Candidat</h3>
        <Info label="Nom" value={data.profile?.full_name || '—'}/><Info label="Téléphone" value={application.phone || data.profile?.phone || '—'}/><Info label="Statut" value={<Badge value={application.status} label={SELLER_LABELS[application.status]}/>}/><Info label="Ancienneté" value={application.years_active != null ? `${application.years_active} an(s)` : '—'}/><Info label="Description" value={application.description || '—'}/><Info label="Catégories" value={(application.activity_categories || []).join(', ') || '—'}/>
      </section>
      <section className="panel detail-card"><h3>Présence digitale</h3>{socialLinks.length ? socialLinks.map(([label, value]) => <Info key={label} label={label} value={String(value).startsWith('http') ? <a href={value} target="_blank" rel="noreferrer">Ouvrir</a> : value}/>) : <Empty/>}</section>
    </div>

    <section className="panel"><h3>Documents privés</h3><div className="doc-grid">{data.documents.length ? data.documents.map(document => <button className="doc-card" type="button" key={document.id} onClick={() => openDocument(document)}><FileText size={20}/><span><strong>{document.original_name}</strong><small>{document.document_type}</small></span></button>) : <Empty/>}</div></section>
    <section className="panel"><h3>Décision</h3>{application.admin_note && <div className="note-box">{application.admin_note}</div>}<div className="button-row">
      <button className="btn ghost" type="button" onClick={() => setAction('under_review')}>Passer en examen</button>
      <button className="btn ghost" type="button" onClick={() => setAction('needs_information')}>Demander des infos</button>
      <button className="btn danger" type="button" onClick={() => setAction('reject')}>Refuser</button>
      <button className="btn primary" type="button" onClick={() => setAction('approve')}>Approuver</button>
      {application.status === 'approved' && <button className="btn danger" type="button" onClick={() => setAction('suspend')}>Suspendre</button>}
    </div></section>

    <ConfirmModal open={Boolean(action)} title={action === 'approve' ? 'Approuver le vendeur' : action === 'reject' ? 'Refuser le vendeur' : action === 'suspend' ? 'Suspendre le vendeur' : action === 'needs_information' ? 'Demander des informations' : 'Mettre en examen'} text="Cette action sera enregistrée dans le journal d’audit." danger={['reject','suspend'].includes(action)} onClose={() => setAction(null)} onConfirm={() => review(action)}>
      <label>Note / motif<textarea required={['reject','suspend','needs_information'].includes(action)} rows={4} value={note} onChange={event => setNote(event.target.value)}/></label>
    </ConfirmModal>
  </>
}
