import { useMemo, useState } from 'react'
import { NavLink, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cdf, dateTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { SectionHead, Loader, Badge } from '../components/UI'

const PROVIDERS = { orange_money: 'Orange Money', airtel_money: 'Airtel Money' }

export default function ManualPaymentsPage() {
  const { staff, can } = useAuth()
  const allowed = can('finance.manage') || staff?.staff_role === 'SUPER_ADMIN'
  const [selected, setSelected] = useState(null)
  const [receivedReference, setReceivedReference] = useState('')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [confirmation, setConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [search, setSearch] = useState('')
  const [backendReady, setBackendReady] = useState(false)

  const { data, loading, error, reload } = useLoad(async () => {
    const { data:settings, error:settingsError } = await supabase
      .from('marketplace_settings').select('value').eq('key','payments').maybeSingle()
    if (settingsError) throw settingsError
    const installed = settings?.value?.mobile_money_backend_ready === true
    setBackendReady(installed)
    if (!installed) return []
    const { data, error } = await supabase
      .from('manual_mobile_money_payments')
      .select('id,order_id,customer_id,provider,recipient_number,expected_amount_cdf,transaction_reference,sender_phone,status,submitted_at,created_at,review_note,verified_at')
      .order('created_at',{ascending:false}).limit(250)
    if (error) throw error
    return data || []
  }, [])

  const visible = useMemo(() => (data || []).filter(row =>
    !search || [row.order_id,row.transaction_reference,row.sender_phone,row.provider].some(v =>
      String(v||'').toLowerCase().includes(search.toLowerCase())
    )
  ), [data,search])

  if (!allowed) return <Navigate to="/403" replace />

  function openReview(row) {
    setSelected(row)
    setReceivedReference('')
    setReceivedAmount('')
    setReviewNote('')
    setConfirmation(false)
    setErrorText('')
  }

  async function review(action) {
    if (!selected || busy) return
    setErrorText('')
    if (action === 'confirm' && !confirmation) return setErrorText('Confirmez avoir vérifié le solde réel sur le compte professionnel.')
    if (!reviewNote.trim() || reviewNote.trim().length < 5) return setErrorText('Renseignez une note de vérification (5 caractères minimum).')
    setBusy(true)
    try {
      const { error } = await supabase.rpc('manual_mobile_money_review',{
        p_claim_id:selected.id,
        p_action:action,
        p_seen_reference:receivedReference.trim(),
        p_received_amount_cdf:action==='confirm' ? Number(receivedAmount) : null,
        p_note:reviewNote.trim(),
      })
      if(error) throw error
      setSelected(null)
      reload()
    } catch (err) {
      setErrorText(err.message || 'La vérification a échoué. Contrôlez les données.')
    } finally { setBusy(false) }
  }

  const pending = (data||[]).filter(row=>row.status==='submitted').length
  const checked = (data||[]).filter(row=>row.status==='verified').length

  return <>
    <SectionHead eyebrow="Paiements" title="Vérification Mobile Money"
      desc="Airtel Money et Orange Money · validation humaine des fonds réellement reçus avant toute préparation."/>
    <div className="finance-status-grid">
      <div><span>À vérifier</span><strong>{pending}</strong></div>
      <div><span>Vérifiés</span><strong>{checked}</strong></div>
    </div>
    {!backendReady && !loading && <div className="alert bad">Le module de vérification doit encore être installé dans la base OneMarket. Aucun paiement ne peut être validé ici.</div>}
    {error && <div className="alert bad">{error}</div>}
    <section className="panel">
      <div className="toolbar-row">
        <input aria-label="Rechercher une transaction" placeholder="Référence, téléphone ou commande…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn ghost" type="button" onClick={reload}>Actualiser</button>
      </div>
      {loading ? <Loader/> : <>
        {visible.filter(row=>row.status==='submitted').length===0 && <p>Aucun paiement en attente de vérification.</p>}
        {visible.filter(row=>row.status==='submitted').map(row=>
          <div className="line-item" key={row.id}>
            <span>
              <strong>{PROVIDERS[row.provider]||row.provider} · {cdf(row.expected_amount_cdf)}</strong>
              <small>Référence : {row.transaction_reference} · Source : {row.sender_phone}</small>
              <small>Soumis le {dateTime(row.submitted_at)} · <NavLink to={`/orders/${row.order_id}`}>Voir la commande</NavLink></small>
            </span>
            <button className="btn primary" type="button" onClick={()=>openReview(row)}>Vérifier</button>
          </div>
        )}
      </>}
    </section>
    {selected && <section className="panel settings-form" style={{maxWidth:720}}>
      <h3>Contrôler la réception réelle des fonds</h3>
      <p>Consultez le SMS / historique officiel du compte marchand. Ne vous fiez jamais à une capture transmise par le client.</p>
      <p>Opérateur : <strong>{PROVIDERS[selected.provider]}</strong></p>
      <p>Numéro destinataire : <strong>{selected.recipient_number}</strong></p>
      <p>Référence déclarée : <strong>{selected.transaction_reference}</strong></p>
      <p>Montant exact : <strong>{cdf(selected.expected_amount_cdf)}</strong></p>
      <div className="form-grid">
        <label>Référence constatée sur le compte marchand<input autoComplete="off" value={receivedReference} onChange={e=>setReceivedReference(e.target.value)} placeholder="Saisir depuis le SMS reçu"/></label>
        <label>Montant réellement reçu (FC)<input type="number" min="1" step="1" value={receivedAmount} onChange={e=>setReceivedAmount(e.target.value)} placeholder="Montant du SMS reçu"/></label>
      </div>
      <label>Note de vérification / motif du signalement<textarea rows="3" required value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Source vérifiée, heure, constat…"/></label>
      <label className="checkbox"><input type="checkbox" checked={confirmation} onChange={e=>setConfirmation(e.target.checked)}/><span>J'ai vérifié personnellement la réception des fonds sur le compte marchand.</span></label>
      {errorText && <div className="alert bad" role="alert">{errorText}</div>}
      <div className="button-row">
        <button className="btn primary" disabled={busy || !confirmation || !receivedReference || !receivedAmount} onClick={()=>review('confirm')} type="button">Confirmer le paiement</button>
        <button className="btn ghost" disabled={busy} onClick={()=>review('reject')} type="button">Signaler une incohérence</button>
        <button className="btn ghost" onClick={()=>setSelected(null)} type="button">Annuler</button>
      </div>
    </section>}
  </>
}
