import { ArrowDown, ArrowUp, Monitor, Pencil, Plus, Smartphone, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { adminUserError, logAdminError } from '../lib/userErrors'
import { EMPTY_PROMOTION, applyPromotion, campaignState, normalizePromotions, promotionError, toLocalInput, validMediaUrl } from '../lib/promotions'
import { SectionHead } from './UI'
import './home-promotions.css'

const cloud = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'nks-services').trim()
const preset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'one_market_sellers').trim()

export function HomePromotionsSettings() {
  const [config, setConfig] = useState(null)
  const [draft, setDraft] = useState(EMPTY_PROMOTION)
  const [editingId, setEditingId] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState('desktop')
  const [previewId, setPreviewId] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [retry, setRetry] = useState(0)
  const editor = useRef(null)
  const busy = saving || uploading

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    supabase.from('marketplace_settings').select('value').eq('key', 'home_promotions').maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError) throw loadError
        if (active) setConfig(normalizePromotions(data?.value))
      }).catch(loadError => {
        logAdminError('promotions.load', loadError)
        if (active) setError(adminUserError(loadError, 'Impossible de charger les publicités. Réessayez.'))
      }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  function openEditor(item) {
    setEditingId(item?.id || null)
    setDraft(item ? { ...item, start_at: toLocalInput(item.start_at), end_at: toLocalInput(item.end_at) } : { ...EMPTY_PROMOTION })
    setEditorOpen(true); setError(''); setNotice('')
    requestAnimationFrame(() => { editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); editor.current?.querySelector('input')?.focus({ preventScroll: true }) })
  }
  async function persist(next, message) {
    if (busy) return false
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: saveError } = await supabase.rpc('erp_update_marketplace_setting', { p_key: 'home_promotions', p_value: next })
      if (saveError) throw saveError
      setConfig(next); setNotice(message); return true
    } catch (saveError) {
      logAdminError('promotions.save', saveError)
      setError(adminUserError(saveError, 'La publicité n’a pas été enregistrée. Réessayez.')); return false
    } finally { setSaving(false) }
  }
  async function saveDraft(event) {
    event.preventDefault()
    const message = promotionError(draft)
    if (message) return setError(message)
    const next = applyPromotion(config, draft, editingId)
    if (await persist(next, editingId ? 'Publicité modifiée.' : 'Publicité ajoutée.')) {
      setPreviewId(editingId || next.items.at(-1).id)
      setEditorOpen(false); setEditingId(null); setDraft({ ...EMPTY_PROMOTION })
    }
  }
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return setError('Choisissez une image ou une vidéo.')
    if (file.size > 45 * 1024 * 1024) return setError('Ce fichier dépasse la limite de 45 Mo.')
    setUploading(true); setError('')
    try {
      const body = new FormData()
      body.append('file', file); body.append('upload_preset', preset)
      body.append('asset_folder', 'one-market/promotions'); body.append('tags', 'one-market,promotion')
      const response = await fetch('https://api.cloudinary.com/v1_1/' + cloud + '/auto/upload', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok || !validMediaUrl(result.secure_url)) throw new Error('MEDIA_UPLOAD_FAILED')
      setDraft(current => ({ ...current, url: result.secure_url, media_type: result.resource_type === 'video' ? 'video' : 'image' }))
    } catch (uploadError) {
      logAdminError('promotions.upload', uploadError)
      setError('Le média n’a pas pu être importé. Vérifiez le fichier et votre connexion, puis réessayez.')
    } finally { setUploading(false) }
  }
  function move(id, delta) {
    const items = [...config.items]
    const index = items.findIndex(item => item.id === id)
    const next = index + delta
    if (index < 0 || next < 0 || next >= items.length) return
    ;[items[index], items[next]] = [items[next], items[index]]
    persist({ ...config, items: items.map((item, sort_order) => ({ ...item, sort_order })) }, 'Ordre des publicités enregistré.')
  }

  const previewItem = editorOpen ? draft : config?.items.find(item => item.id === previewId) || config?.items[0]
  if (loading) return <section className="panel" aria-busy="true">Chargement des publicités…</section>
  if (!config) return <section className="panel"><p role="alert">{error}</p><button className="btn primary" onClick={() => setRetry(value => value + 1)}>Réessayer</button></section>
  return <>
    <section className="panel promo-admin">
      <div className="promo-admin-head"><div><h2>Carrousel d’accueil</h2><p>Les changements enregistrés sont publiés sur One Market.</p></div><button className="btn primary" disabled={busy || editorOpen} onClick={() => openEditor()}><Plus size={16}/> Nouvelle publicité</button></div>
      <div className="promo-admin-controls"><label className="promo-switch"><input type="checkbox" disabled={busy || editorOpen} checked={config.enabled} onChange={e => persist({ ...config, enabled: e.target.checked }, 'Visibilité du carrousel enregistrée.')}/><span>Afficher le carrousel</span></label><label>Rotation automatique<select disabled={busy || editorOpen} value={config.autoplay_seconds} onChange={e => persist({ ...config, autoplay_seconds: Number(e.target.value) }, 'Durée de rotation enregistrée.')}>{Array.from({ length: 13 }, (_, i) => i + 3).map(seconds => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label></div>
      {error && <div className="promo-message" role="alert">{error}</div>}
      {notice && <div className="promo-message ok" role="status">{notice}</div>}
      {editorOpen && <form className="promo-editor" onSubmit={saveDraft} ref={editor}>
        <h3>{editingId ? 'Modifier la publicité' : 'Nouvelle publicité'}</h3>
        <fieldset disabled={busy}><div className="promo-form-grid">
          <label>Titre<input value={draft.title} maxLength={160} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
          <label>Type de média<select value={draft.media_type} onChange={e => setDraft({ ...draft, media_type: e.target.value })}><option value="image">Image</option><option value="video">Vidéo</option></select></label>
          <label className="wide">URL du média<input type="url" required value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…"/></label>
          <label className="wide promo-upload-box"><Upload size={20}/><span>{uploading ? 'Import en cours…' : 'Importer ou remplacer le média'}<small>Image ou vidéo · 45 Mo maximum</small></span><input aria-label="Importer ou remplacer le média" type="file" accept="image/*,video/*" onChange={upload}/></label>
          <label>Lien au clic<input value={draft.link} onChange={e => setDraft({ ...draft, link: e.target.value })} placeholder="/catalog ou https://…"/></label>
          <label>Texte alternatif<input value={draft.alt} maxLength={300} onChange={e => setDraft({ ...draft, alt: e.target.value })} placeholder="Décrivez la publicité"/></label>
          <label>Date de début<input type="datetime-local" value={draft.start_at} onChange={e => setDraft({ ...draft, start_at: e.target.value })}/></label>
          <label>Date de fin<input type="datetime-local" value={draft.end_at} onChange={e => setDraft({ ...draft, end_at: e.target.value })}/></label>
          <p className="wide promo-admin-note">Dates facultatives, dans le fuseau horaire de votre appareil.</p>
          <label className="promo-switch"><input type="checkbox" checked={draft.target_blank} onChange={e => setDraft({ ...draft, target_blank: e.target.checked })}/><span>Ouvrir dans un nouvel onglet</span></label>
          <label className="promo-switch"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/><span>Publicité active</span></label>
        </div></fieldset>
        <div className="button-row"><button className="btn primary" disabled={busy}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button type="button" className="btn ghost" disabled={busy} onClick={() => { setEditorOpen(false); setEditingId(null) }}>Annuler</button></div>
      </form>}
      <div className="promo-list">{config.items.length ? config.items.map((item, index) => <article className="promo-row" key={item.id}>
        <button className="promo-preview" aria-label={'Prévisualiser ' + (item.title || 'la publicité ' + (index + 1))} disabled={editorOpen} onClick={() => setPreviewId(item.id)}>{item.media_type === 'video' ? <video src={item.url} muted playsInline preload="metadata"/> : <img src={item.url} alt="" loading="lazy"/>}</button>
        <div className="promo-row-body"><strong>{item.title || 'Publicité ' + (index + 1)}</strong><span>{campaignState(item)} · {item.media_type === 'video' ? 'Vidéo' : 'Image'}</span><small>{item.link || 'Sans lien'}</small></div>
        <div className="promo-row-actions">
          <button className="btn ghost" disabled={busy || editorOpen} onClick={() => openEditor(item)}><Pencil size={16}/> Modifier</button>
          <button className="btn ghost" disabled={busy || editorOpen} onClick={() => persist({ ...config, items: config.items.map(row => row.id === item.id ? { ...row, active: !row.active } : row) }, 'Visibilité de la publicité enregistrée.')}>{item.active ? 'Désactiver' : 'Activer'}</button>
          <button className="btn ghost" aria-label={'Monter ' + (item.title || 'la publicité')} disabled={busy || editorOpen || index === 0} onClick={() => move(item.id, -1)}><ArrowUp size={16}/></button>
          <button className="btn ghost" aria-label={'Descendre ' + (item.title || 'la publicité')} disabled={busy || editorOpen || index === config.items.length - 1} onClick={() => move(item.id, 1)}><ArrowDown size={16}/></button>
          <button className="btn ghost danger" aria-label={'Supprimer ' + (item.title || 'la publicité')} disabled={busy || editorOpen} onClick={() => setDeleteId(item.id)}><Trash2 size={16}/></button>
        </div>
        {deleteId === item.id && <div className="promo-delete-confirm" role="alert"><p>Supprimer cette publicité du carrousel ?</p><div className="button-row"><button className="btn danger" disabled={busy} onClick={async () => { if (await persist({ ...config, items: config.items.filter(row => row.id !== item.id).map((row, sort_order) => ({ ...row, sort_order })) }, 'Publicité supprimée.')) setDeleteId(null) }}>Confirmer la suppression</button><button className="btn ghost" disabled={busy} onClick={() => setDeleteId(null)}>Annuler</button></div></div>}
      </article>) : <p className="promo-empty">Aucune publicité. Ajoutez votre première campagne.</p>}</div>
    </section>
    <section className="panel"><div className="promo-admin-head"><h2>Aperçu {editorOpen ? 'des modifications' : 'de la publicité'}</h2><div className="button-row"><button className={'btn ' + (preview === 'desktop' ? 'primary' : 'ghost')} aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor size={16}/> Desktop</button><button className={'btn ' + (preview === 'mobile' ? 'primary' : 'ghost')} aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone size={16}/> Mobile</button></div></div><div className={'promo-live-preview ' + preview}>{previewItem && validMediaUrl(previewItem.url) ? previewItem.media_type === 'video' ? <video src={previewItem.url} muted controls playsInline/> : <img src={previewItem.url} alt={previewItem.alt || previewItem.title || 'Aperçu de la publicité'}/> : <span>Ajoutez un média pour afficher l’aperçu.</span>}</div></section>
  </>
}
export default function HomePromotionsPage() {
  const { staff } = useAuth()
  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>
  return <><SectionHead eyebrow="Marketplace" title="Publicités" desc="Modifiez, planifiez et ordonnez vos campagnes."/><HomePromotionsSettings/></>
}
