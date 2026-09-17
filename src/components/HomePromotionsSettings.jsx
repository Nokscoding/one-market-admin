import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SectionHead } from './UI'
import './home-promotions.css'

const CLOUDINARY_CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'nks-services').trim()
const CLOUDINARY_UPLOAD_PRESET = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'one_market_sellers').trim()
const EMPTY_DRAFT = { title: '', media_type: 'image', url: '', link: '', alt: '' }

function normalizeConfig(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    enabled: raw.enabled !== false,
    autoplay_seconds: Math.max(3, Math.min(15, Number(raw.autoplay_seconds) || 6)),
    items: Array.isArray(raw.items) ? raw.items.map((item, index) => ({
      id: item.id || `promo-${index}-${Date.now()}`,
      title: String(item.title || ''),
      media_type: item.media_type === 'video' ? 'video' : 'image',
      url: String(item.url || ''),
      link: String(item.link || ''),
      alt: String(item.alt || ''),
      active: item.active !== false,
      sort_order: Number(item.sort_order ?? index),
    })).sort((a, b) => a.sort_order - b.sort_order) : [],
  }
}

function validMediaUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function validTarget(value) {
  const target = String(value || '').trim()
  if (!target) return true
  if (target.startsWith('/') && !target.startsWith('//')) return true
  return validMediaUrl(target)
}

async function uploadPromoMedia(file) {
  if (!(file instanceof File)) throw new Error('Sélectionne une image ou une vidéo.')
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) throw new Error('Format non accepté. Utilise une image ou une vidéo.')
  if (file.size > 45 * 1024 * 1024) throw new Error('Fichier trop lourd. Maximum : 45 Mo.')
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) throw new Error('Cloudinary n’est pas configuré.')

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  body.append('asset_folder', 'one-market/promotions')
  body.append('tags', 'one-market,promotion')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.secure_url) throw new Error(result?.error?.message || 'Impossible d’envoyer le média sur Cloudinary.')
  return { url: result.secure_url, media_type: result.resource_type === 'video' ? 'video' : 'image' }
}

function HomePromotionsSettings() {
  const [config, setConfig] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    supabase.from('marketplace_settings').select('value').eq('key', 'home_promotions').maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      setConfig(normalizeConfig(data?.value))
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  function addItem() {
    setMessage('')
    const url = draft.url.trim()
    const link = draft.link.trim()
    if (!validMediaUrl(url)) return setMessage('Ajoute une URL HTTPS valide ou importe un fichier.')
    if (!validTarget(link)) return setMessage('Le lien doit commencer par /, http:// ou https://.')
    const item = {
      id: globalThis.crypto?.randomUUID?.() || `promo-${Date.now()}`,
      title: draft.title.trim(),
      media_type: draft.media_type === 'video' ? 'video' : 'image',
      url,
      link,
      alt: draft.alt.trim(),
      active: true,
      sort_order: config.items.length,
    }
    setConfig(current => ({ ...current, items: [...current.items, item] }))
    setDraft(EMPTY_DRAFT)
  }

  function updateItem(id, patch) {
    setConfig(current => ({ ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch } : item) }))
  }

  function removeItem(id) {
    setConfig(current => ({ ...current, items: current.items.filter(item => item.id !== id).map((item, index) => ({ ...item, sort_order: index })) }))
  }

  function moveItem(id, delta) {
    setConfig(current => {
      const items = [...current.items]
      const index = items.findIndex(item => item.id === id)
      const next = index + delta
      if (index < 0 || next < 0 || next >= items.length) return current
      ;[items[index], items[next]] = [items[next], items[index]]
      return { ...current, items: items.map((item, order) => ({ ...item, sort_order: order })) }
    })
  }

  async function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setMessage('')
    try {
      const uploaded = await uploadPromoMedia(file)
      setDraft(current => ({ ...current, ...uploaded }))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    setMessage('')
    const clean = {
      enabled: config.enabled !== false,
      autoplay_seconds: Math.max(3, Math.min(15, Number(config.autoplay_seconds) || 6)),
      items: config.items.map((item, index) => ({
        ...item,
        title: String(item.title || '').trim(),
        url: String(item.url || '').trim(),
        link: String(item.link || '').trim(),
        alt: String(item.alt || '').trim(),
        media_type: item.media_type === 'video' ? 'video' : 'image',
        active: item.active !== false,
        sort_order: index,
      })).filter(item => validMediaUrl(item.url) && validTarget(item.link)),
    }
    const { error } = await supabase.rpc('erp_update_marketplace_setting', { p_key: 'home_promotions', p_value: clean })
    if (error) setMessage(error.message)
    else {
      setConfig(clean)
      setMessage('Carrousel publié sur l’accueil One Market.')
    }
    setSaving(false)
  }

  if (loading || !config) return <section className="panel promo-admin"><h3>Carrousel publicitaire</h3><p className="promo-admin-note">Chargement…</p></section>

  return <section className="panel promo-admin">
    <div className="promo-admin-head"><div><h3>Carrousel publicitaire accueil</h3><p>Images ou vidéos affichées tout en haut de One Market, comme un espace de campagne Amazon.</p></div><label className="promo-switch"><input type="checkbox" checked={config.enabled} onChange={event => setConfig({ ...config, enabled: event.target.checked })}/><span>Actif</span></label></div>

    <div className="promo-admin-controls">
      <label>Rotation automatique (secondes)<input type="number" min="3" max="15" value={config.autoplay_seconds} onChange={event => setConfig({ ...config, autoplay_seconds: Math.max(3, Math.min(15, Number(event.target.value) || 6)) })}/></label>
    </div>

    <div className="promo-editor">
      <div className="promo-upload-box">
        <Upload size={22}/><strong>{uploading ? 'Import en cours…' : 'Importer une image ou vidéo'}</strong><span>JPG, PNG, WebP, AVIF ou vidéo · 45 Mo max</span>
        <label className={`btn ghost ${uploading ? 'disabled' : ''}`}>Choisir un fichier<input type="file" accept="image/*,video/*" disabled={uploading} onChange={onFile}/></label>
      </div>
      <div className="promo-form-grid">
        <label>Type<select value={draft.media_type} onChange={event => setDraft({ ...draft, media_type: event.target.value })}><option value="image">Image</option><option value="video">Vidéo</option></select></label>
        <label>URL du média<input value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} placeholder="https://..."/></label>
        <label>Titre facultatif<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Offre de la semaine"/></label>
        <label>Lien au clic<input value={draft.link} onChange={event => setDraft({ ...draft, link: event.target.value })} placeholder="/catalog ou https://..."/></label>
        <label className="wide">Texte alternatif<input value={draft.alt} onChange={event => setDraft({ ...draft, alt: event.target.value })} placeholder="Description courte du visuel"/></label>
      </div>
      <button className="btn primary" type="button" onClick={addItem}><Plus size={16}/> Ajouter au carrousel</button>
    </div>

    <div className="promo-list">
      {config.items.length ? config.items.map((item, index) => <article className="promo-row" key={item.id}>
        <div className="promo-preview">{item.media_type === 'video' ? <video src={item.url} muted playsInline preload="metadata"/> : <img src={item.url} alt=""/>}<span>{item.media_type === 'video' ? <Video size={15}/> : <ImageIcon size={15}/>}</span></div>
        <div className="promo-row-body"><strong>{item.title || `Publicité ${index + 1}`}</strong><span>{item.url}</span><label><input type="checkbox" checked={item.active !== false} onChange={event => updateItem(item.id, { active: event.target.checked })}/> Visible</label></div>
        <div className="promo-row-actions"><button type="button" title="Monter" onClick={() => moveItem(item.id, -1)} disabled={index === 0}><ArrowUp size={16}/></button><button type="button" title="Descendre" onClick={() => moveItem(item.id, 1)} disabled={index === config.items.length - 1}><ArrowDown size={16}/></button><button type="button" className="danger" title="Supprimer" onClick={() => removeItem(item.id)}><Trash2 size={16}/></button></div>
      </article>) : <div className="promo-empty">Aucune publicité configurée. Ajoute un média ci-dessus.</div>}
    </div>

    {message && <div className={`promo-message ${message.startsWith('Carrousel') ? 'ok' : ''}`}>{message}</div>}
    <div className="button-row"><button className="btn primary" type="button" disabled={saving} onClick={save}>{saving ? 'Publication…' : 'Publier le carrousel'}</button></div>
  </section>
}

export default function HomePromotionsPage() {
  const { staff } = useAuth()
  if (staff?.staff_role !== 'SUPER_ADMIN') return <Navigate to="/403" replace/>
  return <>
    <SectionHead eyebrow="Marketplace" title="Publicités" desc="Pilote le carrousel image/vidéo affiché tout en haut de l’accueil One Market."/>
    <HomePromotionsSettings/>
  </>
}
