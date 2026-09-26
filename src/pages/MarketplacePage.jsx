import { adminUserError } from '../lib/userErrors'
import { useMemo, useState } from 'react'
import { BadgeCheck, ChevronRight, EyeOff, ImageOff, MessageSquare, ShieldAlert, Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { dateTime, usd } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { Badge, ConfirmModal, Loader, Metric, SearchBar, SectionHead, Table } from '../components/UI'

export function StoresPage() {
  const { staff, can } = useAuth()
  const superAdmin = staff?.staff_role === 'SUPER_ADMIN'
  const canVerifyStore = superAdmin || can('stores.verify')
  const canSuspendStore = superAdmin || can('stores.suspend')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [modal, setModal] = useState(null)
  const [value, setValue] = useState('')
  const [pickupForm, setPickupForm] = useState({contact_name:'',phone:'',address_line:'',district:'',city:'Lubumbashi',landmark:'',instructions:'',latitude:'',longitude:''})
  const [actionError, setActionError] = useState('')
  const { data, loading, error, reload } = useLoad(async () => { const {data:stores,error}=await supabase.rpc('erp_stores_overview',{p_search:search||null,p_status:status||null,p_limit:250,p_offset:0}); if(error)throw error; return stores||[] }, [search,status])

  async function openFinance(store) { setActionError(''); const [{data,error},{data:pickup,error:pickupError}]=await Promise.all([supabase.rpc('erp_store_financials',{p_store_id:store.id,p_from:null,p_to:null}),supabase.from('store_pickup_points').select('*').eq('store_id',store.id).maybeSingle()]); if(error)return setActionError(adminUserError(error)); if(pickupError)return setActionError(adminUserError(pickupError)); setSelected({...store,finance:data,pickup:pickup||null}) }
  async function setTrust(store,kind) { setActionError(''); const {error}=await supabase.rpc('erp_set_store_trust',{p_store_id:store.id,p_verified:kind==='verified'?!store.is_verified:store.is_verified,p_partner:kind==='partner'?!store.is_partner:store.is_partner}); if(error)return setActionError(adminUserError(error)); reload() }
  function changeStatus(store) { setActionError(''); setValue(''); setModal({type:'status',store}) }
  async function saveStatus() { setActionError(''); const next=modal.store.status==='active'?'suspended':'active'; const {error}=await supabase.rpc('erp_set_store_status',{p_store_id:modal.store.id,p_status:next,p_reason:value||'Réactivation ERP'}); if(error)return setActionError(adminUserError(error)); setModal(null); reload() }
  function commission(store) { setActionError(''); setValue(String(store.commission_percent||0)); setModal({type:'commission',store}) }
  async function saveCommission() { const n=Number(value); if(!Number.isFinite(n)||n<0||n>100)return setActionError('La commission doit être comprise entre 0 et 100 %.'); setActionError(''); const {error}=await supabase.rpc('erp_set_store_commission',{p_store_id:modal.store.id,p_percent:n}); if(error)return setActionError(adminUserError(error)); setModal(null); reload() }
  async function clearCommission(store) { setActionError(''); const {error}=await supabase.rpc('erp_clear_store_commission',{p_store_id:store.id}); if(error)return setActionError(adminUserError(error)); setSelected(null); reload() }
  function openPickup(store){ const pickup=store.pickup||{}; setPickupForm({contact_name:pickup.contact_name||store.owner_name||'',phone:pickup.phone||'',address_line:pickup.address_line||'',district:pickup.district||'',city:pickup.city||store.city||'Lubumbashi',landmark:pickup.landmark||'',instructions:pickup.instructions||'',latitude:pickup.latitude??'',longitude:pickup.longitude??''}); setModal({type:'pickup',store}) }
  async function savePickup(){ setActionError(''); const lat=pickupForm.latitude===''?null:Number(pickupForm.latitude); const lng=pickupForm.longitude===''?null:Number(pickupForm.longitude); const {data,error}=await supabase.rpc('erp_upsert_store_pickup_point',{p_store_id:modal.store.id,p_contact_name:pickupForm.contact_name||null,p_phone:pickupForm.phone,p_address_line:pickupForm.address_line,p_district:pickupForm.district||null,p_city:pickupForm.city||'Lubumbashi',p_landmark:pickupForm.landmark||null,p_instructions:pickupForm.instructions||null,p_latitude:Number.isFinite(lat)?lat:null,p_longitude:Number.isFinite(lng)?lng:null}); if(error)return setActionError(adminUserError(error,'Impossible d’enregistrer le point de retrait.')); if(selected?.id===modal.store.id)setSelected({...selected,pickup:data}); setModal(null) }
  if(loading)return <Loader/>
  return <>
    <SectionHead eyebrow="Marketplace" title="Boutiques" desc="Performance, commission, statut, vérification et solde vendeur."/>
    <div className="toolbar-row"><SearchBar value={search} onChange={setSearch} placeholder="Boutique, propriétaire, email ou ville"/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les statuts</option><option value="active">Actives</option><option value="suspended">Suspendues</option></select></div>
    {(error||actionError)&&<div className="alert bad">{error||actionError}</div>}
    <Table headers={['Boutique','Propriétaire','Ville','Statut','Produits','Commandes','CA','Commission','Solde','']} rows={(data||[]).map(store=>[<div><strong>{store.name}</strong><span>{store.is_partner?'Partenaire · ':''}{store.is_verified?'Vérifiée':''}</span></div>,<div><strong>{store.owner_name||'—'}</strong><span>{store.owner_email||'—'}</span></div>,store.city||'—',<Badge value={store.status}/>,store.product_count,store.order_count,usd(store.sales_usd),<div><strong>{Number(store.commission_percent||0).toFixed(2)} %</strong><span>{store.commission_source==='custom'?'Spécifique':'Générale'}</span></div>,usd(store.seller_due_usd),<div className="button-row compact"><button className="row-action" onClick={()=>openFinance(store)}>Ouvrir</button>{superAdmin&&<button className="row-action" onClick={()=>commission(store)}>Commission</button>}</div>])}/>
    {selected&&<div className="drawer-backdrop" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span>Boutique</span><h2>{selected.name}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><div className="metrics-grid compact"><Metric icon={Store} label="Ventes livrées" value={usd(selected.finance?.metrics?.delivered_sales_usd)}/><Metric icon={BadgeCheck} label="Commission" value={`${Number(selected.finance?.effective_commission||0).toFixed(2)} %`} sub={selected.finance?.commission_source==='custom'?'personnalisée':'générale'}/><Metric icon={Store} label="À payer" value={usd(selected.finance?.metrics?.seller_due_usd)}/><Metric icon={Store} label="Déjà payé" value={usd(selected.finance?.metrics?.seller_paid_usd)}/></div><section className="panel"><h3>Informations</h3><div className="info-row"><span>Propriétaire</span><div>{selected.owner_name||selected.owner_email||'—'}</div></div><div className="info-row"><span>Commission One Market</span><div>{usd(selected.finance?.metrics?.commission_generated_usd)}</div></div><div className="info-row"><span>Revenu vendeur</span><div>{usd(selected.finance?.metrics?.seller_earnings_usd)}</div></div><div className="info-row"><span>Commandes livrées</span><div>{selected.finance?.metrics?.delivered_orders||0}</div></div></section><section className="panel"><h3>Point de retrait livreur</h3><div className="pickup-admin-summary"><div><strong>{selected.pickup?.contact_name||'À configurer'}</strong><span>{selected.pickup?.phone||'Aucun téléphone de retrait'}</span><small>{selected.pickup?.address_line ? [selected.pickup.address_line,selected.pickup.district,selected.pickup.city].filter(Boolean).join(', ') : 'Ajoutez une adresse privée visible uniquement par NKS et le livreur assigné.'}</small></div><button className="btn ghost" onClick={()=>openPickup(selected)}>Configurer</button></div></section><section className="panel"><h3>Transactions</h3><Table headers={['Commande','Date','Brut','Commission','Vendeur','Paiement']} rows={(selected.finance?.transactions||[]).slice(0,50).map(t=>[t.number,dateTime(t.date),usd(t.gross),usd(t.commission),usd(t.seller_net),<Badge value={t.settlement_status}/>])}/></section><div className="button-row">{superAdmin&&<><button className="btn ghost" onClick={()=>commission(selected)}>Modifier commission</button>{selected.finance?.commission_source==='custom'&&<button className="btn ghost" onClick={()=>clearCommission(selected)}>Revenir à la commission générale</button>}</>}{canVerifyStore&&<button className="btn ghost" onClick={()=>setTrust(selected,'verified')}>{selected.is_verified?'Retirer vérification':'Vérifier'}</button>}{superAdmin&&<button className="btn gold" onClick={()=>setTrust(selected,'partner')}>{selected.is_partner?'Retirer partenaire':'Partenaire'}</button>}{canSuspendStore&&<button className={`btn ${selected.status==='active'?'danger':'primary'}`} onClick={()=>changeStatus(selected)}>{selected.status==='active'?'Suspendre':'Activer'}</button>}</div></aside></div>}
    <ConfirmModal open={modal?.type==='status'} title={modal?.store?.status==='active'?'Suspendre la boutique':'Réactiver la boutique'} danger={modal?.store?.status==='active'} onClose={()=>setModal(null)} onConfirm={saveStatus}><label>Motif<textarea rows={3} value={value} onChange={e=>setValue(e.target.value)} required={modal?.store?.status==='active'}/></label></ConfirmModal>
    <ConfirmModal open={modal?.type==='commission'} title="Commission personnalisée" text={modal?.store?.name} onClose={()=>setModal(null)} onConfirm={saveCommission}><label>Commission (%)<input type="number" min="0" max="100" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label></ConfirmModal>
    <ConfirmModal open={modal?.type==='pickup'} title="Point de retrait One Market" text={modal?.store?.name} onClose={()=>setModal(null)} onConfirm={savePickup}><div className="form-grid"><label>Contact<input value={pickupForm.contact_name} onChange={e=>setPickupForm({...pickupForm,contact_name:e.target.value})}/></label><label>Téléphone<input required value={pickupForm.phone} onChange={e=>setPickupForm({...pickupForm,phone:e.target.value})}/></label><label className="wide">Adresse de retrait<input required value={pickupForm.address_line} onChange={e=>setPickupForm({...pickupForm,address_line:e.target.value})} placeholder="Avenue, numéro, immeuble…"/></label><label>Quartier / commune<input value={pickupForm.district} onChange={e=>setPickupForm({...pickupForm,district:e.target.value})}/></label><label>Ville<input value={pickupForm.city} onChange={e=>setPickupForm({...pickupForm,city:e.target.value})}/></label><label className="wide">Point de repère<input value={pickupForm.landmark} onChange={e=>setPickupForm({...pickupForm,landmark:e.target.value})}/></label><label className="wide">Instructions livreur<textarea rows={3} value={pickupForm.instructions} onChange={e=>setPickupForm({...pickupForm,instructions:e.target.value})}/></label><label>Latitude<input inputMode="decimal" value={pickupForm.latitude} onChange={e=>setPickupForm({...pickupForm,latitude:e.target.value})}/></label><label>Longitude<input inputMode="decimal" value={pickupForm.longitude} onChange={e=>setPickupForm({...pickupForm,longitude:e.target.value})}/></label></div></ConfirmModal>
  </>
}

export function ProductsPage() {
  const { can } = useAuth()
  const canModerate = can('products.moderate')
  const [search,setSearch]=useState('')
  const [store,setStore]=useState('')
  const [state,setState]=useState('all')
  const [selected,setSelected]=useState(null)
  const [modal,setModal]=useState(null)
  const [reason,setReason]=useState('')
  const [notice,setNotice]=useState(null)
  const [actionError,setActionError]=useState('')
  const [actionNotice,setActionNotice]=useState('')

  const {data,loading,error,reload}=useLoad(async()=>{
    const {data:products,error}=await supabase
      .from('products')
      .select('id,name,description,price,old_price,currency,stock_qty,is_active,rating_avg,rating_count,created_at,updated_at,store_id,category_id')
      .order('created_at',{ascending:false})
      .limit(250)
    if(error)throw error

    const productIds=(products||[]).map(product=>product.id)
    const storeIds=[...new Set((products||[]).map(product=>product.store_id))]
    const [storeResult,imageResult]=await Promise.all([
      storeIds.length
        ? supabase.from('stores').select('id,name,owner_id,status,is_verified').in('id',storeIds)
        : Promise.resolve({data:[],error:null}),
      productIds.length
        ? supabase.from('product_images').select('id,product_id,secure_url,alt_text,sort_order,created_at').in('product_id',productIds).order('sort_order')
        : Promise.resolve({data:[],error:null}),
    ])
    if(storeResult.error)throw storeResult.error
    if(imageResult.error)throw imageResult.error

    const storeMap=Object.fromEntries((storeResult.data||[]).map(item=>[item.id,item]))
    const imageMap={}
    ;(imageResult.data||[]).forEach(image=>{(imageMap[image.product_id]||=[]).push(image)})
    return {
      products:(products||[]).map(product=>({
        ...product,
        store:storeMap[product.store_id]||null,
        store_name:storeMap[product.store_id]?.name||'—',
        images:imageMap[product.id]||[],
      })),
      stores:storeResult.data||[],
    }
  },[])

  const visible=useMemo(()=>(data?.products||[]).filter(product=>{
    const query=search.trim().toLowerCase()
    return (!query||`${product.name} ${product.store_name||''}`.toLowerCase().includes(query))
      &&(!store||product.store_id===store)
      &&(state==='all'||(state==='active'?product.is_active:!product.is_active))
  }),[data,search,store,state])

  function moderate(product){
    setActionError('')
    setReason('')
    setModal(product)
  }

  async function saveModeration(){
    if(!modal)return
    setActionError('')
    const next=!modal.is_active
    const {error}=await supabase.rpc('erp_moderate_product',{
      p_product_id:modal.id,
      p_active:next,
      p_reason:reason||'Réactivation ERP',
    })
    if(error)return setActionError(adminUserError(error))
    setModal(null)
    setSelected(current=>current?.id===modal.id?{...current,is_active:next}:current)
    reload()
  }

  function defaultModerationMessage(product,issue){
    if(issue==='photo_inappropriate') return `La photo du produit « ${product.name} » n’est pas conforme aux standards One Market. Merci de la remplacer par une image appropriée avant de poursuivre sa mise en avant.`
    if(issue==='listing_quality') return `La présentation du produit « ${product.name} » doit être améliorée. Merci de revoir les visuels et les informations afin que l’annonce soit claire, propre et professionnelle.`
    if(issue==='other') return ''
    return `La photo du produit « ${product.name} » doit être améliorée : elle est mal cadrée, peu nette ou ne présente pas suffisamment bien l’article. Le produit ne sera pas mis en avant tant que le visuel n’aura pas été corrigé.`
  }

  function openNotice(product,issue='photo_quality'){
    setActionError('')
    setActionNotice('')
    setNotice({
      product,
      issue,
      message:defaultModerationMessage(product,issue),
      hide:false,
    })
  }

  function changeIssue(issue){
    setNotice(current=>current?{...current,issue,message:defaultModerationMessage(current.product,issue)}:current)
  }

  async function sendNotice(){
    if(!notice?.product||notice.message.trim().length<10)return setActionError('Écrivez un message d’au moins 10 caractères.')
    setActionError('')
    const {data:ticketId,error}=await supabase.rpc('erp_send_product_moderation_notice',{
      p_product_id:notice.product.id,
      p_issue_type:notice.issue,
      p_message:notice.message.trim(),
      p_hide_product:Boolean(notice.hide),
    })
    if(error)return setActionError(adminUserError(error,'Impossible d’envoyer le message au vendeur.'))
    setActionNotice(`Message envoyé au vendeur · ticket ${String(ticketId||'').slice(0,8)}`)
    setNotice(null)
    if(notice.hide)setSelected(current=>current?.id===notice.product.id?{...current,is_active:false}:current)
    reload()
  }

  return <>
    <SectionHead eyebrow="Marketplace" title="Produits" desc="Contrôle visuel du catalogue, qualité des photos et communication directe avec les vendeurs."/>
    <div className="toolbar-row">
      <SearchBar value={search} onChange={setSearch} placeholder="Produit ou boutique"/>
      <select value={store} onChange={event=>setStore(event.target.value)}><option value="">Toutes les boutiques</option>{(data?.stores||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={state} onChange={event=>setState(event.target.value)}><option value="all">Tous</option><option value="active">Actifs</option><option value="inactive">Masqués</option></select>
    </div>
    {(error||actionError)&&<div className="alert bad">{error||actionError}</div>}
    {actionNotice&&<div className="alert good">{actionNotice}</div>}
    {loading?<Loader/>:<>
      <div className="moderation-summary">
        <span>Produits affichés <strong>{visible.length}</strong></span>
        <span>Sans photo <strong>{visible.filter(product=>!product.images.length).length}</strong></span>
        <span>Masqués <strong>{visible.filter(product=>!product.is_active).length}</strong></span>
      </div>
      <div className="moderation-product-grid">
        {visible.map(product=>{
          const image=product.images[0]?.secure_url
          return <article className="moderation-product-card" key={product.id}>
            <button className="moderation-product-media" type="button" onClick={()=>setSelected(product)}>
              {image?<img src={image} alt={product.name} loading="lazy"/>:<span><ImageOff size={28}/> Aucune photo</span>}
              <b className={product.is_active?'is-live':'is-hidden'}>{product.is_active?'En ligne':'Masqué'}</b>
            </button>
            <div className="moderation-product-body">
              <span className="moderation-store-name">{product.store_name}</span>
              <h3>{product.name}</h3>
              <div className="moderation-product-meta"><strong>{usd(product.price)}</strong><span>Stock {product.stock_qty}</span><span>★ {Number(product.rating_avg||0).toFixed(1)} ({product.rating_count||0})</span></div>
              <div className="button-row compact">
                <button className="btn ghost" type="button" onClick={()=>setSelected(product)}>Inspecter <ChevronRight size={15}/></button>
                {canModerate&&<button className="btn primary" type="button" onClick={()=>openNotice(product)}><MessageSquare size={15}/> Écrire au vendeur</button>}
              </div>
            </div>
          </article>
        })}
      </div>
    </>}

    {selected&&<div className="drawer-backdrop" onClick={()=>setSelected(null)}>
      <aside className="drawer moderation-product-drawer" onClick={event=>event.stopPropagation()}>
        <div className="drawer-head"><div><span>Contrôle produit</span><h2>{selected.name}</h2><small>{selected.store_name}</small></div><button onClick={()=>setSelected(null)}>×</button></div>
        <div className="moderation-gallery">
          {selected.images.length?selected.images.map((image,index)=><figure key={image.id}><img src={image.secure_url} alt={image.alt_text||`${selected.name} · photo ${index+1}`}/><figcaption>Photo {index+1}</figcaption></figure>):<div className="moderation-gallery-empty"><ImageOff size={32}/><strong>Aucune image produit</strong></div>}
        </div>
        <section className="panel"><h3>Informations catalogue</h3>
          <div className="info-row"><span>Boutique</span><div>{selected.store_name}</div></div>
          <div className="info-row"><span>Prix</span><div>{usd(selected.price)}</div></div>
          <div className="info-row"><span>Stock</span><div>{selected.stock_qty}</div></div>
          <div className="info-row"><span>Note</span><div>{Number(selected.rating_avg||0).toFixed(1)} / 5 · {selected.rating_count||0} avis</div></div>
          <div className="info-row"><span>Statut</span><div><Badge value={selected.is_active?'active':'suspended'} label={selected.is_active?'Actif':'Masqué'}/></div></div>
          <div className="info-row"><span>Description</span><div>{selected.description||'—'}</div></div>
        </section>
        {canModerate&&<div className="moderation-drawer-actions">
          <button className="btn primary" onClick={()=>openNotice(selected)}><MessageSquare size={16}/> Envoyer une remarque</button>
          <button className="btn ghost" onClick={()=>openNotice(selected,'photo_inappropriate')}><ShieldAlert size={16}/> Photo non conforme</button>
          <button className={`btn ${selected.is_active?'danger':'ghost'}`} onClick={()=>moderate(selected)}>{selected.is_active?<><EyeOff size={16}/> Masquer le produit</>:'Réactiver le produit'}</button>
        </div>}
      </aside>
    </div>}

    <ConfirmModal open={!!modal} title={modal?.is_active?'Masquer le produit':'Réactiver le produit'} danger={modal?.is_active} onClose={()=>setModal(null)} onConfirm={saveModeration}>
      <label>Motif<textarea rows={3} value={reason} onChange={event=>setReason(event.target.value)} required={modal?.is_active}/></label>
    </ConfirmModal>

    <ConfirmModal open={!!notice} title="Message de modération" text={notice?.product?notice.product.name:''} onClose={()=>setNotice(null)} onConfirm={sendNotice}>
      <div className="moderation-message-form">
        <label>Type de remarque<select value={notice?.issue||'photo_quality'} onChange={event=>changeIssue(event.target.value)}>
          <option value="photo_quality">Photo à améliorer</option>
          <option value="photo_inappropriate">Photo inappropriée / non conforme</option>
          <option value="listing_quality">Présentation du produit</option>
          <option value="other">Autre</option>
        </select></label>
        <label>Message au vendeur<textarea rows={6} maxLength={3000} value={notice?.message||''} onChange={event=>setNotice(current=>({...current,message:event.target.value}))} placeholder="Écrivez précisément ce qui doit être corrigé…"/></label>
        <label className="checkbox"><input type="checkbox" checked={Boolean(notice?.hide)} onChange={event=>setNotice(current=>({...current,hide:event.target.checked}))}/><span>Masquer aussi le produit jusqu’à correction</span></label>
        <p className="moderation-message-help">Le vendeur recevra une notification et pourra répondre depuis son espace vendeur. La discussion apparaîtra comme un ticket de modération.</p>
      </div>
    </ConfirmModal>
  </>
}

