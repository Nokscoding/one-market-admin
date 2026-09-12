import { useMemo, useState } from 'react'
import { BadgeCheck, Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, Empty, Loader, SearchBar, SectionHead, Table } from '../components/UI'

export function StoresPage() {
  const { staff } = useAuth()
  const [search, setSearch] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const { data: stores, error } = await supabase.from('stores').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return stores || []
  }, [])

  const visible = useMemo(() => (data || []).filter(store => !search || `${store.name} ${store.city || ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])

  async function setTrust(store, kind) {
    const partner = kind === 'partner' ? !store.is_partner : store.is_partner
    const verified = kind === 'verified' ? !store.is_verified : store.is_verified
    const { error } = await supabase.rpc('erp_set_store_trust', { p_store_id: store.id, p_verified: verified, p_partner: partner })
    if (!error) reload()
  }

  async function toggleStatus(store) {
    const nextStatus = store.status === 'active' ? 'suspended' : 'active'
    const reason = nextStatus === 'suspended' ? window.prompt('Motif de suspension :') : 'Réactivation ERP'
    if (nextStatus === 'suspended' && !reason) return
    const { error } = await supabase.rpc('erp_set_store_status', { p_store_id: store.id, p_status: nextStatus, p_reason: reason })
    if (!error) reload()
  }

  return <>
    <SectionHead eyebrow="Marketplace" title="Boutiques" desc="Vérification, partenariat et statut des boutiques."/>
    <SearchBar value={search} onChange={setSearch} placeholder="Rechercher une boutique"/>
    {loading ? <Loader/> : <div className="cards-list">{visible.length ? visible.map(store => <article className="store-row" key={store.id}>
      <div className="store-logo">{store.logo_url ? <img src={store.logo_url} alt=""/> : <Store size={21}/>}</div>
      <div className="grow"><div className="inline-title"><strong>{store.name}</strong>{store.is_partner ? <span className="trust gold">◆ Partenaire</span> : store.is_verified ? <span className="trust blue"><BadgeCheck size={14}/> Vérifiée</span> : null}</div><span>{store.city || '—'} · {store.status}</span></div>
      <div className="button-row compact"><button className="btn ghost" type="button" onClick={() => setTrust(store, 'verified')}>{store.is_verified ? 'Retirer vérification' : 'Vérifier'}</button>{staff?.staff_role === 'SUPER_ADMIN' && <button className="btn gold" type="button" onClick={() => setTrust(store, 'partner')}>{store.is_partner ? 'Retirer partenaire' : 'Partenaire'}</button>}<button className={`btn ${store.status === 'active' ? 'danger' : 'primary'}`} type="button" onClick={() => toggleStatus(store)}>{store.status === 'active' ? 'Suspendre' : 'Activer'}</button></div>
    </article>) : <Empty/>}</div>}
  </>
}

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const { data: products, error } = await supabase.from('products').select('id,name,price,currency,stock_qty,is_active,rating_avg,rating_count,created_at,store_id').order('created_at', { ascending: false }).limit(250)
    if (error) throw error
    const storeIds = [...new Set((products || []).map(product => product.store_id))]
    const { data: stores } = storeIds.length ? await supabase.from('stores').select('id,name').in('id', storeIds) : { data: [] }
    const storeMap = Object.fromEntries((stores || []).map(store => [store.id, store.name]))
    return (products || []).map(product => ({ ...product, store_name: storeMap[product.store_id] }))
  }, [])

  const visible = useMemo(() => (data || []).filter(product => !search || `${product.name} ${product.store_name || ''}`.toLowerCase().includes(search.toLowerCase())), [data, search])

  async function moderate(product) {
    const nextActive = !product.is_active
    const reason = !nextActive ? window.prompt('Motif du masquage :') : 'Réactivation ERP'
    if (!nextActive && !reason) return
    const { error } = await supabase.rpc('erp_moderate_product', { p_product_id: product.id, p_active: nextActive, p_reason: reason })
    if (!error) reload()
  }

  return <>
    <SectionHead eyebrow="Marketplace" title="Produits" desc="Vue globale et modération du catalogue."/>
    <SearchBar value={search} onChange={setSearch} placeholder="Produit ou boutique"/>
    {loading ? <Loader/> : <Table headers={['Produit','Boutique','Prix','Stock','Note','Statut','']} rows={visible.map(product => [
      product.name,
      product.store_name || '—',
      usd(product.price),
      product.stock_qty,
      `${Number(product.rating_avg || 0).toFixed(1)} (${product.rating_count || 0})`,
      <Badge value={product.is_active ? 'active' : 'suspended'} label={product.is_active ? 'Actif' : 'Masqué'}/>,
      <button className={`row-action ${product.is_active ? 'danger-text' : ''}`} type="button" onClick={() => moderate(product)}>{product.is_active ? 'Masquer' : 'Réactiver'}</button>,
    ])}/>} 
  </>
}
