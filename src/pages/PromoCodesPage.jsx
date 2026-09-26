import { useMemo, useState } from 'react'
import { Plus, TicketPercent } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { adminUserError } from '../lib/userErrors'
import { dateTime, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Loader, SearchBar, SectionHead, Table } from '../components/UI'

const EMPTY = {
  id: null,
  code: '',
  discount_type: 'percent',
  discount_value: '10',
  max_discount_usd: '',
  min_order_usd: '0',
  starts_at: '',
  ends_at: '',
  usage_limit: '',
  per_user_limit: '1',
  is_active: true,
}

function toInputDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function promoValue(row) {
  return row.discount_type === 'percent'
    ? `${Number(row.discount_value || 0).toFixed(2).replace(/\.00$/, '')} %`
    : usd(row.discount_value)
}

export default function PromoCodesPage() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)

  const { data, loading, error, reload } = useLoad(async () => {
    const { data: rows, error: loadError } = await supabase.rpc('erp_list_promo_codes')
    if (loadError) throw loadError
    return rows || []
  }, [])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return data || []
    return (data || []).filter(row => String(row.code || '').toLowerCase().includes(needle))
  }, [data, search])

  function createPromo() {
    setActionError('')
    setForm({ ...EMPTY })
    setModal({ type: 'edit', title: 'Nouveau code promo' })
  }

  function editPromo(row) {
    setActionError('')
    setForm({
      id: row.id,
      code: row.code || '',
      discount_type: row.discount_type || 'percent',
      discount_value: String(row.discount_value ?? ''),
      max_discount_usd: row.max_discount_usd == null ? '' : String(row.max_discount_usd),
      min_order_usd: String(row.min_order_usd ?? 0),
      starts_at: toInputDate(row.starts_at),
      ends_at: toInputDate(row.ends_at),
      usage_limit: row.usage_limit == null ? '' : String(row.usage_limit),
      per_user_limit: String(row.per_user_limit ?? 1),
      is_active: row.is_active !== false,
    })
    setModal({ type: 'edit', title: `Modifier ${row.code}` })
  }

  async function savePromo() {
    const value = Number(form.discount_value)
    const min = Number(form.min_order_usd || 0)
    const perUser = Number(form.per_user_limit || 1)
    if (!form.code.trim()) return setActionError('Le code est obligatoire.')
    if (!Number.isFinite(value) || value <= 0) return setActionError('La valeur de la réduction est invalide.')
    if (form.discount_type === 'percent' && value > 100) return setActionError('Une réduction en pourcentage ne peut pas dépasser 100 %.')
    if (!Number.isFinite(min) || min < 0) return setActionError('Le minimum de commande est invalide.')
    if (!Number.isInteger(perUser) || perUser < 1) return setActionError('La limite par client doit être au moins 1.')

    setSaving(true)
    setActionError('')
    try {
      const { error: saveError } = await supabase.rpc('erp_upsert_promo_code', {
        p_id: form.id || null,
        p_code: form.code.trim().toUpperCase(),
        p_discount_type: form.discount_type,
        p_discount_value: value,
        p_max_discount_usd: optionalNumber(form.max_discount_usd),
        p_min_order_usd: min,
        p_starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        p_ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        p_usage_limit: optionalNumber(form.usage_limit),
        p_per_user_limit: perUser,
        p_is_active: form.is_active,
      })
      if (saveError) throw saveError
      setModal(null)
      await reload()
    } catch (saveError) {
      setActionError(adminUserError(saveError, 'Impossible d’enregistrer ce code promo.'))
    } finally {
      setSaving(false)
    }
  }

  async function togglePromo(row) {
    setActionError('')
    try {
      const { error: toggleError } = await supabase.rpc('erp_set_promo_code_active', { p_id: row.id, p_active: !row.is_active })
      if (toggleError) throw toggleError
      await reload()
    } catch (toggleError) {
      setActionError(adminUserError(toggleError, 'Impossible de modifier ce code promo.'))
    }
  }

  if (loading) return <Loader/>

  return <>
    <SectionHead eyebrow="Marketplace" title="Codes promo" desc="Réductions One Market financées par la marketplace, avec dates, quotas et limites par client."/>
    <div className="toolbar-row">
      <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un code"/>
      <button className="btn primary" type="button" onClick={createPromo}><Plus size={17}/> Nouveau code</button>
    </div>
    {(error || actionError) && <div className="alert bad">{error || actionError}</div>}

    <Table
      headers={['Code','Réduction','Minimum','Utilisations','Période','Statut','']}
      rows={visible.map(row => [
        <div><strong>{row.code}</strong><span>{row.discount_type === 'percent' && row.max_discount_usd != null ? `Plafond ${usd(row.max_discount_usd)}` : 'One Market'}</span></div>,
        promoValue(row),
        usd(row.min_order_usd),
        <div><strong>{row.times_redeemed || 0}{row.usage_limit ? ` / ${row.usage_limit}` : ''}</strong><span>{row.per_user_limit} / client</span></div>,
        <div><strong>{row.starts_at ? dateTime(row.starts_at) : 'Immédiat'}</strong><span>{row.ends_at ? `→ ${dateTime(row.ends_at)}` : 'Sans expiration'}</span></div>,
        <Badge value={row.is_active ? 'active' : 'suspended'} label={row.is_active ? 'Actif' : 'Désactivé'}/>,
        <div className="button-row compact"><button className="row-action" onClick={() => editPromo(row)}>Modifier</button><button className={`row-action ${row.is_active ? 'danger-text' : ''}`} onClick={() => togglePromo(row)}>{row.is_active ? 'Désactiver' : 'Activer'}</button></div>,
      ])}
    />

    <ConfirmModal open={modal?.type === 'edit'} title={modal?.title || 'Code promo'} onClose={() => !saving && setModal(null)} onConfirm={savePromo}>
      <div className="form-grid">
        <label>Code<input value={form.code} maxLength={32} onChange={e => setForm(current => ({ ...current, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))} placeholder="BIENVENUE10"/></label>
        <label>Type<select value={form.discount_type} onChange={e => setForm(current => ({ ...current, discount_type: e.target.value }))}><option value="percent">Pourcentage</option><option value="fixed">Montant fixe (USD)</option></select></label>
        <label>Valeur<input type="number" min="0.01" step="0.01" value={form.discount_value} onChange={e => setForm(current => ({ ...current, discount_value: e.target.value }))}/></label>
        <label>Minimum commande (USD)<input type="number" min="0" step="0.01" value={form.min_order_usd} onChange={e => setForm(current => ({ ...current, min_order_usd: e.target.value }))}/></label>
        <label>Plafond réduction (USD)<input type="number" min="0" step="0.01" disabled={form.discount_type !== 'percent'} value={form.max_discount_usd} onChange={e => setForm(current => ({ ...current, max_discount_usd: e.target.value }))} placeholder="Optionnel"/></label>
        <label>Limite totale<input type="number" min="1" step="1" value={form.usage_limit} onChange={e => setForm(current => ({ ...current, usage_limit: e.target.value }))} placeholder="Illimitée"/></label>
        <label>Limite / client<input type="number" min="1" step="1" value={form.per_user_limit} onChange={e => setForm(current => ({ ...current, per_user_limit: e.target.value }))}/></label>
        <label>Début<input type="datetime-local" value={form.starts_at} onChange={e => setForm(current => ({ ...current, starts_at: e.target.value }))}/></label>
        <label>Fin<input type="datetime-local" value={form.ends_at} onChange={e => setForm(current => ({ ...current, ends_at: e.target.value }))}/></label>
        <label className="wide"><span>État</span><select value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm(current => ({ ...current, is_active: e.target.value === 'active' }))}><option value="active">Actif</option><option value="inactive">Désactivé</option></select></label>
      </div>
      {actionError && <div className="alert bad">{actionError}</div>}
      {saving && <div className="alert">Enregistrement…</div>}
    </ConfirmModal>
  </>
}
