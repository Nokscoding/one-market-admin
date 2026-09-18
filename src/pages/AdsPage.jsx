import { CircleDollarSign, Clock3, Megaphone, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { adminUserError } from '../lib/userErrors'
import { useLoad } from '../lib/useLoad'
import { usd, dateTime } from '../lib/format'
import { Badge, ConfirmModal, Loader, Metric, SectionHead, Table } from '../components/UI'

const statusLabel = {
  pending_payment:'Paiement en attente',
  pending_review:'À valider',
  scheduled:'Programmée',
  active:'Active',
  completed:'Terminée',
  rejected:'Refusée',
  cancelled:'Annulée',
}
const paymentLabel = {
  pending:'En attente',
  paid:'Payé',
  failed:'Échoué',
  refund_pending:'Remboursement',
  refunded:'Remboursé',
}

export default function AdsPage() {
  const [modal,setModal]=useState(null)
  const [value,setValue]=useState('')
  const [actionError,setActionError]=useState('')
  const {data,loading,error,reload}=useLoad(async()=>{
    const {data,error}=await supabase.rpc('erp_ads_overview')
    if(error) throw error
    return data||{metrics:{},packages:[],campaigns:[]}
  },[])

  async function run(campaign,action,note=null,reference=null) {
    setActionError('')
    const {error}=await supabase.rpc('erp_review_ad_campaign',{
      p_campaign_id:campaign.id,
      p_action:action,
      p_note:note,
      p_payment_reference:reference,
    })
    if(error){ setActionError(adminUserError(error)); return false }
    setModal(null); setValue(''); reload(); return true
  }

  function open(campaign,type) { setValue(''); setActionError(''); setModal({campaign,type}) }

  async function confirmModal() {
    if(!modal) return
    if(modal.type==='paid') {
      if(!value.trim()) return setActionError('Ajoutez la référence du paiement Mobile Money ou cash.')
      await run(modal.campaign,'mark_paid',null,value.trim())
    } else if(modal.type==='reject') {
      if(!value.trim()) return setActionError('Indiquez la raison du refus.')
      await run(modal.campaign,'reject',value.trim(),null)
    } else if(modal.type==='cancel') {
      await run(modal.campaign,'cancel',value.trim()||'Annulation ERP',null)
    }
  }

  if(loading) return <Loader/>
  const m=data?.metrics||{}
  const campaigns=data?.campaigns||[]
  const packages=data?.packages||[]

  return <>
    <SectionHead eyebrow="Monétisation" title="One Market Ads" desc="Campagnes sponsorisées, paiements, validation et revenus publicitaires."/>
    {(error||actionError)&&<div className="alert bad">{error||actionError}</div>}

    <div className="metrics-grid">
      <Metric icon={CircleDollarSign} label="Revenus Ads encaissés" value={usd(m.revenue_paid_usd)}/>
      <Metric icon={PlayCircle} label="Campagnes actives" value={m.active||0}/>
      <Metric icon={Clock3} label="Paiements à confirmer" value={m.pending_payment||0}/>
      <Metric icon={Megaphone} label="Campagnes à valider" value={m.pending_review||0}/>
    </div>

    <section className="panel">
      <div className="panel-head"><div><Megaphone size={18}/><h3>Tarifs One Market Ads</h3></div></div>
      <div className="ads-package-grid">
        {packages.map(pkg=><article key={pkg.id}><span>{pkg.target_type.replace('_',' ')}</span><strong>{pkg.name}</strong><b>{usd(pkg.price_usd)}</b><small>{pkg.duration_days} jour{pkg.duration_days>1?'s':''} · {pkg.placement}</small></article>)}
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><Megaphone size={18}/><h3>Campagnes</h3></div><span>{campaigns.length} campagne{campaigns.length>1?'s':''}</span></div>
      <Table headers={['Boutique','Offre','Montant','Paiement','Statut','Période','Actions']} rows={campaigns.map(c=>[
        <div><strong>{c.store_name}</strong><span>{c.owner_name||'—'}{c.product_name?' · '+c.product_name:''}{c.category_name?' · '+c.category_name:''}</span></div>,
        <div><strong>{c.package_name}</strong><span>{c.placement}</span></div>,
        usd(c.amount_usd),
        <div><Badge value={c.payment_status} label={paymentLabel[c.payment_status]||c.payment_status}/>{c.payment_reference&&<span>Réf. {c.payment_reference}</span>}</div>,
        <Badge value={c.status} label={statusLabel[c.status]||c.status}/>,
        <div><strong>{c.starts_at?dateTime(c.starts_at):'—'}</strong><span>{c.ends_at?'→ '+dateTime(c.ends_at):'Pas encore active'}</span></div>,
        <div className="button-row compact">
          {c.payment_status==='pending'&&<button className="row-action" onClick={()=>open(c,'paid')}>Confirmer paiement</button>}
          {c.payment_status==='paid'&&c.status==='pending_review'&&<button className="row-action" onClick={()=>run(c,'approve')}>Activer</button>}
          {['pending_payment','pending_review'].includes(c.status)&&<button className="row-action danger-text" onClick={()=>open(c,'reject')}>Refuser</button>}
          {c.status==='active'&&<button className="row-action danger-text" onClick={()=>open(c,'cancel')}>Arrêter</button>}
          {c.payment_status==='refund_pending'&&<button className="row-action" onClick={()=>run(c,'refund')}>Remboursé</button>}
        </div>
      ])}/>
    </section>

    <ConfirmModal open={modal?.type==='paid'} title="Confirmer le paiement Ads" text={modal?.campaign?.store_name} onClose={()=>setModal(null)} onConfirm={confirmModal}>
      <label>Référence du paiement<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Ex. MPESA-123456"/></label>
    </ConfirmModal>
    <ConfirmModal open={modal?.type==='reject'} title="Refuser la campagne" danger text={modal?.campaign?.store_name} onClose={()=>setModal(null)} onConfirm={confirmModal}>
      <label>Motif<textarea rows={3} value={value} onChange={e=>setValue(e.target.value)} placeholder="Expliquez la raison au vendeur"/></label>
    </ConfirmModal>
    <ConfirmModal open={modal?.type==='cancel'} title="Arrêter la campagne" danger text={modal?.campaign?.store_name} onClose={()=>setModal(null)} onConfirm={confirmModal}>
      <label>Motif<textarea rows={3} value={value} onChange={e=>setValue(e.target.value)} placeholder="Facultatif"/></label>
    </ConfirmModal>
  </>
}
