import { ArrowDown, ArrowUp, Monitor, Move, Pencil, Plus, RotateCcw, Smartphone, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { adminUserError, logAdminError } from '../lib/userErrors'
import { EMPTY_PROMOTION, applyPromotion, campaignState, normalizePromotions, promotionCrop, promotionError, promotionMedia, toLocalInput, validMediaUrl } from '../lib/promotions'
import { SectionHead } from './UI'
import './home-promotions.css'

const cloud = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'nks-services').trim()
const preset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'one_market_sellers').trim()

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function clampBannerHeight(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback
}

function cropKeys(mode) {
  const prefix = mode === 'mobile' ? 'crop_mobile' : 'crop_desktop'
  return { x: `${prefix}_x`, y: `${prefix}_y`, zoom: `${prefix}_zoom` }
}

function PromoCropStage({ item, mode, height, fit = 'cover', onChange, readOnly = false }) {
  const crop = promotionCrop(item, mode)
  const drag = useRef(null)
  const keys = cropKeys(mode)
  const media = promotionMedia(item, mode)
  const valid = item && validMediaUrl(media.url)

  function update(patch) {
    if (readOnly || typeof onChange !== 'function') return
    const next = {}
    if (patch.x != null) next[keys.x] = clamp(patch.x, 0, 100)
    if (patch.y != null) next[keys.y] = clamp(patch.y, 0, 100)
    if (patch.zoom != null) next[keys.zoom] = clamp(patch.zoom, 100, 300)
    onChange(next)
  }

  function startDrag(event) {
    if (readOnly || !valid) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: crop.x, y: crop.y }
  }

  function moveDrag(event) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId || readOnly) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const deltaX = ((event.clientX - state.clientX) / rect.width) * 100
    const deltaY = ((event.clientY - state.clientY) / rect.height) * 100
    update({ x: state.x - deltaX, y: state.y - deltaY })
  }

  function endDrag(event) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const referenceWidth = mode === 'mobile' ? 390 : 1280
  const style = {
    height: 'auto',
    aspectRatio: `${referenceWidth} / ${height}`,
    '--promo-preview-fit': fit,
    '--promo-preview-x': `${crop.x}%`,
    '--promo-preview-y': `${crop.y}%`,
    '--promo-preview-zoom': crop.zoom / 100,
  }

  return <div className={'promo-crop-shell ' + mode}>
    <div
      className={'promo-live-preview promo-live-preview--crop ' + mode + (readOnly ? ' is-readonly' : '')}
      style={style}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => update({ x: 50, y: 50 })}
      role={readOnly ? undefined : 'application'}
      aria-label={readOnly ? undefined : `Recadrage ${mode === 'mobile' ? 'mobile' : 'desktop'} du média`}
    >
      {valid
        ? media.type === 'video'
          ? <video src={media.url} muted autoPlay loop playsInline preload="metadata"/>
          : <img src={media.url} alt={item.alt || item.title || 'Aperçu de la publicité'} draggable="false"/>
        : <span>Ajoutez une version {mode === 'mobile' ? 'mobile' : 'PC'} pour commencer le cadrage.</span>}
      {valid && !readOnly && <div className="promo-crop-frame" aria-hidden="true"><span><Move size={15}/> Glissez le média pour cadrer</span></div>}
    </div>
    {!readOnly && <div className="promo-crop-toolbar">
      <label>
        <span>Zoom {mode === 'mobile' ? 'mobile' : 'desktop'}</span>
        <div className="promo-crop-control">
          <input type="range" min="100" max="300" step="5" value={crop.zoom} onChange={event => update({ zoom: Number(event.target.value) })}/>
          <output>{Math.round(crop.zoom)}%</output>
        </div>
      </label>
      <button type="button" className="btn ghost promo-crop-reset" onClick={() => update({ x: 50, y: 50, zoom: 100 })}><RotateCcw size={15}/> Réinitialiser</button>
    </div>}
  </div>
}

export function HomePromotionsSettings() {
  const [config, setConfig] = useState(null)
  const [draft, setDraft] = useState(EMPTY_PROMOTION)
  const [editingId, setEditingId] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingMode, setUploadingMode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState('desktop')
  const [previewId, setPreviewId] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [retry, setRetry] = useState(0)
  const editor = useRef(null)
  const busy = saving || Boolean(uploadingMode)

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
    const base = item ? normalizePromotions({ items: [item] }).items[0] : { ...EMPTY_PROMOTION }
    setDraft({ ...base, start_at: toLocalInput(base.start_at), end_at: toLocalInput(base.end_at) })
    setEditorOpen(true); setError(''); setNotice('')
    requestAnimationFrame(() => {
      editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      editor.current?.querySelector('input')?.focus({ preventScroll: true })
    })
  }

  function updateDraftCrop(patch) {
    setDraft(current => ({ ...current, ...patch }))
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

  async function upload(event, mode) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return setError('Choisissez une image ou une vidéo.')
    if (file.size > 45 * 1024 * 1024) return setError('Ce fichier dépasse la limite de 45 Mo.')
    const target = mode === 'mobile' ? 'mobile' : 'desktop'
    setUploadingMode(target); setError('')
    try {
      const body = new FormData()
      body.append('file', file); body.append('upload_preset', preset)
      body.append('asset_folder', 'one-market/promotions'); body.append('tags', 'one-market,promotion,' + target)
      const response = await fetch('https://api.cloudinary.com/v1_1/' + cloud + '/auto/upload', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok || !validMediaUrl(result.secure_url)) throw new Error('MEDIA_UPLOAD_FAILED')
      const type = result.resource_type === 'video' ? 'video' : 'image'
      setDraft(current => target === 'mobile'
        ? {
            ...current,
            mobile_url: result.secure_url,
            mobile_media_type: type,
            crop_mobile_x: 50, crop_mobile_y: 50, crop_mobile_zoom: 100,
          }
        : {
            ...current,
            url: result.secure_url,
            media_type: type,
            desktop_url: result.secure_url,
            desktop_media_type: type,
            crop_desktop_x: 50, crop_desktop_y: 50, crop_desktop_zoom: 100,
          })
      setPreview(target)
    } catch (uploadError) {
      logAdminError('promotions.upload.' + target, uploadError)
      setError('La version ' + (target === 'mobile' ? 'mobile' : 'PC') + ' n’a pas pu être importée. Vérifiez le fichier et votre connexion, puis réessayez.')
    } finally { setUploadingMode('') }
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
      <div className="promo-admin-controls">
        <label className="promo-switch"><input type="checkbox" disabled={busy || editorOpen} checked={config.enabled} onChange={e => persist({ ...config, enabled: e.target.checked }, 'Visibilité du carrousel enregistrée.')}/><span>Afficher le carrousel</span></label>
        <label>Rotation automatique<select disabled={busy || editorOpen} value={config.autoplay_seconds} onChange={e => persist({ ...config, autoplay_seconds: Number(e.target.value) }, 'Durée de rotation enregistrée.')}>{Array.from({ length: 13 }, (_, i) => i + 3).map(seconds => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label>
        <label className="promo-size-label">Hauteur ordinateur<div className="promo-size-control"><input type="range" min="180" max="640" step="10" disabled={busy || editorOpen} value={config.desktop_height} onChange={e => setConfig(current => ({ ...current, desktop_height: clampBannerHeight(e.target.value, 180, 640, 320) }))}/><output>{config.desktop_height}px</output></div></label>
        <label className="promo-size-label">Hauteur mobile<div className="promo-size-control"><input type="range" min="140" max="520" step="10" disabled={busy || editorOpen} value={config.mobile_height} onChange={e => setConfig(current => ({ ...current, mobile_height: clampBannerHeight(e.target.value, 140, 520, 240) }))}/><output>{config.mobile_height}px</output></div></label>
        <label>Remplissage du média<select disabled={busy || editorOpen} value={config.media_fit} onChange={e => setConfig(current => ({ ...current, media_fit: e.target.value === 'contain' ? 'contain' : 'cover' }))}><option value="cover">Remplir / recadrer</option><option value="contain">Afficher en entier</option></select></label>
        <button type="button" className="btn ghost promo-layout-save" disabled={busy || editorOpen} onClick={() => persist({ ...config, desktop_height: clampBannerHeight(config.desktop_height, 180, 640, 320), mobile_height: clampBannerHeight(config.mobile_height, 140, 520, 240), media_fit: config.media_fit === 'contain' ? 'contain' : 'cover' }, 'Format de la bannière enregistré.')}>Enregistrer le format</button>
      </div>

      {error && <div className="promo-message" role="alert">{error}</div>}
      {notice && <div className="promo-message ok" role="status">{notice}</div>}

      {editorOpen && <form className="promo-editor" onSubmit={saveDraft} ref={editor}>
        <h3>{editingId ? 'Modifier la publicité' : 'Nouvelle publicité'}</h3>
        <div className="promo-editor-workspace">
          <fieldset disabled={busy}>
            <div className="promo-form-grid">
              <label className="wide">Titre<input value={draft.title} maxLength={160} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>

              <div className="wide promo-device-media-grid">
                <section className="promo-device-media-card">
                  <div className="promo-device-media-title"><Monitor size={18}/><div><strong>Version PC</strong><small>Obligatoire · bannière large</small></div></div>
                  <label>Type<select value={draft.desktop_media_type || draft.media_type || 'image'} onChange={e => setDraft({ ...draft, desktop_media_type: e.target.value, media_type: e.target.value })}><option value="image">Image</option><option value="video">Vidéo</option></select></label>
                  <label>URL PC<input type="url" required value={draft.desktop_url || draft.url || ''} onChange={e => setDraft({ ...draft, desktop_url: e.target.value, url: e.target.value })} placeholder="https://…"/></label>
                  <label className="promo-upload-box"><Upload size={20}/><span>{uploadingMode === 'desktop' ? 'Import PC en cours…' : 'Téléverser la version PC'}<small>Image ou vidéo · 45 Mo maximum</small></span><input aria-label="Téléverser la version PC" type="file" accept="image/*,video/*" onChange={event => upload(event, 'desktop')}/></label>
                </section>

                <section className="promo-device-media-card">
                  <div className="promo-device-media-title"><Smartphone size={18}/><div><strong>Version mobile</strong><small>Recommandée · format téléphone</small></div></div>
                  <label>Type<select value={draft.mobile_media_type || 'image'} onChange={e => setDraft({ ...draft, mobile_media_type: e.target.value })}><option value="image">Image</option><option value="video">Vidéo</option></select></label>
                  <label>URL mobile<input type="url" value={draft.mobile_url || ''} onChange={e => setDraft({ ...draft, mobile_url: e.target.value })} placeholder="https://… (facultatif)"/></label>
                  <label className="promo-upload-box"><Upload size={20}/><span>{uploadingMode === 'mobile' ? 'Import mobile en cours…' : 'Téléverser la version mobile'}<small>Si vide, la version PC sera utilisée</small></span><input aria-label="Téléverser la version mobile" type="file" accept="image/*,video/*" onChange={event => upload(event, 'mobile')}/></label>
                  {draft.mobile_url && <button type="button" className="btn ghost promo-remove-mobile" onClick={() => setDraft(current => ({ ...current, mobile_url: '', mobile_media_type: current.desktop_media_type || current.media_type || 'image' }))}>Utiliser la version PC à la place</button>}
                </section>
              </div>

              <label>Lien au clic<input value={draft.link} onChange={e => setDraft({ ...draft, link: e.target.value })} placeholder="/catalog ou https://…"/></label>
              <label>Texte alternatif<input value={draft.alt} maxLength={300} onChange={e => setDraft({ ...draft, alt: e.target.value })} placeholder="Décrivez la publicité"/></label>

              <div className="wide promo-crop-editor">
                <div>
                  <strong>Cadrage responsive</strong>
                  <small>Chaque format peut utiliser son propre fichier. Le cadrage Desktop et le cadrage Mobile restent indépendants.</small>
                </div>
                <div className="promo-crop-summary"><Monitor size={16}/><span>Desktop</span><strong>{Math.round(promotionCrop(draft, 'desktop').zoom)}%</strong></div>
                <div className="promo-crop-summary"><Smartphone size={16}/><span>Mobile</span><strong>{Math.round(promotionCrop(draft, 'mobile').zoom)}%</strong></div>
              </div>

              <label>Date de début<input type="datetime-local" value={draft.start_at} onChange={e => setDraft({ ...draft, start_at: e.target.value })}/></label>
              <label>Date de fin<input type="datetime-local" value={draft.end_at} onChange={e => setDraft({ ...draft, end_at: e.target.value })}/></label>
              <p className="wide promo-admin-note">Dates facultatives, dans le fuseau horaire de votre appareil.</p>
              <label className="promo-switch"><input type="checkbox" checked={draft.target_blank} onChange={e => setDraft({ ...draft, target_blank: e.target.checked })}/><span>Ouvrir dans un nouvel onglet</span></label>
              <label className="promo-switch"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/><span>Publicité active</span></label>
            </div>
          </fieldset>

          <aside className="promo-editor-live">
            <div className="promo-editor-live-head">
              <div><span>Cadrage en direct</span><strong>{preview === 'desktop' ? 'Desktop' : 'Mobile'}</strong></div>
              <div className="button-row compact">
                <button type="button" className={'btn ' + (preview === 'desktop' ? 'primary' : 'ghost')} aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor size={15}/> Desktop</button>
                <button type="button" className={'btn ' + (preview === 'mobile' ? 'primary' : 'ghost')} aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone size={15}/> Mobile</button>
              </div>
            </div>

            <PromoCropStage
              item={draft}
              mode={preview}
              height={preview === 'desktop' ? config.desktop_height : config.mobile_height}
              fit={config.media_fit}
              onChange={updateDraftCrop}
            />

            <p className="promo-editor-live-help">
              Glissez la version sélectionnée dans le cadre. Cet aperçu reprend le ratio réel One Market ({preview === 'desktop' ? `1280 × ${config.desktop_height}px` : `390 × ${config.mobile_height}px`}). Ce que vous voyez ici correspond au cadrage publié. Le cadrage {preview === 'desktop' ? 'Desktop' : 'Mobile'} n’affecte pas l’autre format.
            </p>
          </aside>
        </div>

        <div className="button-row"><button className="btn primary" disabled={busy}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button type="button" className="btn ghost" disabled={busy} onClick={() => { setEditorOpen(false); setEditingId(null) }}>Annuler</button></div>
      </form>}

      <div className="promo-list">{config.items.length ? config.items.map((item, index) => <article className="promo-row" key={item.id}>
        <button className="promo-preview" aria-label={'Prévisualiser ' + (item.title || 'la publicité ' + (index + 1))} disabled={editorOpen} onClick={() => setPreviewId(item.id)}>
          {item.media_type === 'video' ? <video src={item.url} muted playsInline preload="metadata"/> : <img src={item.url} alt="" loading="lazy"/>}
        </button>
        <div className="promo-row-body"><strong>{item.title || 'Publicité ' + (index + 1)}</strong><span>{campaignState(item)} · {item.media_type === 'video' ? 'Vidéo' : 'Image'} · PC + Mobile</span><small>{item.link || 'Sans lien'}</small></div>
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

    {!editorOpen && <section className="panel">
      <div className="promo-admin-head"><h2>Aperçu de la publicité</h2><div className="button-row"><button className={'btn ' + (preview === 'desktop' ? 'primary' : 'ghost')} aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor size={16}/> Desktop</button><button className={'btn ' + (preview === 'mobile' ? 'primary' : 'ghost')} aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone size={16}/> Mobile</button></div></div>
      <PromoCropStage item={previewItem} mode={preview} height={preview === 'desktop' ? config.desktop_height : config.mobile_height} fit={config.media_fit} readOnly/>
    </section>}
  </>
}

export default function HomePromotionsPage() {
  const { staff } = useAuth()
  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>
  return <><SectionHead eyebrow="Marketplace" title="Publicités" desc="Modifiez, planifiez et ordonnez vos campagnes."/><HomePromotionsSettings/></>
}
