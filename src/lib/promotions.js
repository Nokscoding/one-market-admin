const DEFAULT_CROP = { x: 50, y: 50, zoom: 100 }

export const EMPTY_PROMOTION = {
  title: '',
  media_type: 'image',
  url: '',
  link: '',
  alt: '',
  start_at: '',
  end_at: '',
  target_blank: false,
  active: true,
  crop_x: 50,
  crop_y: 50,
  crop_zoom: 100,
  crop_desktop_x: 50,
  crop_desktop_y: 50,
  crop_desktop_zoom: 100,
  crop_mobile_x: 50,
  crop_mobile_y: 50,
  crop_mobile_zoom: 100,
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export function promotionCrop(item, mode = 'desktop') {
  const prefix = mode === 'mobile' ? 'crop_mobile' : 'crop_desktop'
  return {
    x: clamp(item?.[`${prefix}_x`] ?? item?.crop_x, 0, 100, DEFAULT_CROP.x),
    y: clamp(item?.[`${prefix}_y`] ?? item?.crop_y, 0, 100, DEFAULT_CROP.y),
    zoom: clamp(item?.[`${prefix}_zoom`] ?? item?.crop_zoom, 100, 300, DEFAULT_CROP.zoom),
  }
}

export function normalizePromotions(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    enabled: raw.enabled !== false,
    autoplay_seconds: Math.max(3, Math.min(15, Number(raw.autoplay_seconds) || 6)),
    desktop_height: Math.max(180, Math.min(640, Number(raw.desktop_height) || 320)),
    mobile_height: Math.max(140, Math.min(520, Number(raw.mobile_height) || 240)),
    media_fit: raw.media_fit === 'contain' ? 'contain' : 'cover',
    items: (Array.isArray(raw.items) ? raw.items : []).map((item, index) => {
      const desktop = promotionCrop(item, 'desktop')
      const mobile = promotionCrop(item, 'mobile')
      return {
        ...EMPTY_PROMOTION,
        ...item,
        id: item.id || 'legacy-promotion-' + index,
        active: item.active !== false,
        target_blank: item.target_blank === true,
        media_type: item.media_type === 'video' ? 'video' : 'image',
        crop_x: desktop.x,
        crop_y: desktop.y,
        crop_zoom: desktop.zoom,
        crop_desktop_x: desktop.x,
        crop_desktop_y: desktop.y,
        crop_desktop_zoom: desktop.zoom,
        crop_mobile_x: mobile.x,
        crop_mobile_y: mobile.y,
        crop_mobile_zoom: mobile.zoom,
        sort_order: Number(item.sort_order ?? index),
      }
    }).sort((a, b) => a.sort_order - b.sort_order),
  }
}

export function validMediaUrl(value) {
  try { return new URL(String(value || '').trim()).protocol === 'https:' } catch { return false }
}

export function validTarget(value) {
  const target = String(value || '').trim()
  if (!target) return true
  if (target.startsWith('/') && !target.startsWith('//') && !target.includes('\\')) return true
  return validMediaUrl(target)
}

export function promotionError(draft) {
  if (!validMediaUrl(draft.url)) return 'Ajoutez une URL HTTPS valide ou importez un fichier.'
  if (!validTarget(draft.link)) return 'Utilisez un lien HTTPS ou un chemin du site commençant par /.'
  if (draft.start_at && !Number.isFinite(Date.parse(draft.start_at))) return 'La date de début est invalide.'
  if (draft.end_at && !Number.isFinite(Date.parse(draft.end_at))) return 'La date de fin est invalide.'
  if (draft.start_at && draft.end_at && Date.parse(draft.end_at) <= Date.parse(draft.start_at)) return 'La fin doit être postérieure au début.'
  return ''
}

export function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function applyPromotion(config, draft, editingId) {
  const error = promotionError(draft)
  if (error) throw new Error(error)

  const desktop = promotionCrop(draft, 'desktop')
  const mobile = promotionCrop(draft, 'mobile')
  const item = {
    ...draft,
    id: editingId || crypto.randomUUID(),
    title: String(draft.title || '').trim(),
    url: draft.url.trim(),
    link: String(draft.link || '').trim(),
    alt: String(draft.alt || '').trim(),
    start_at: draft.start_at ? new Date(draft.start_at).toISOString() : '',
    end_at: draft.end_at ? new Date(draft.end_at).toISOString() : '',
    crop_x: desktop.x,
    crop_y: desktop.y,
    crop_zoom: desktop.zoom,
    crop_desktop_x: desktop.x,
    crop_desktop_y: desktop.y,
    crop_desktop_zoom: desktop.zoom,
    crop_mobile_x: mobile.x,
    crop_mobile_y: mobile.y,
    crop_mobile_zoom: mobile.zoom,
  }

  const items = editingId
    ? config.items.map(current => current.id === editingId ? { ...current, ...item } : current)
    : [...config.items, item]

  return { ...config, items: items.map((current, sort_order) => ({ ...current, sort_order })) }
}

export function campaignState(item) {
  if (!item.active) return 'Inactive'
  if (item.start_at && Date.parse(item.start_at) > Date.now()) return 'Programmée'
  if (item.end_at && Date.parse(item.end_at) <= Date.now()) return 'Terminée'
  return 'Active'
}
