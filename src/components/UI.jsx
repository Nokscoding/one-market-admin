import { Boxes, Search, X } from 'lucide-react'
import { tone, statusLabel } from '../lib/format'

export function Loader({ fullscreen = false }) {
  return <div className={fullscreen ? 'screen-center' : 'loader-inline'}><div className="spinner"/><span>Chargement…</span></div>
}

export function Empty({ children = 'Aucune donnée pour le moment.' }) {
  return <div className="empty-state"><Boxes size={28}/><strong>{children}</strong></div>
}

export function Badge({ value, label }) {
  return <span className={`status ${tone(value)}`}>{label || (value ? statusLabel(value) : '—')}</span>
}

export function SectionHead({ eyebrow, title, desc, actions }) {
  return <div className="section-head"><div><span>{eyebrow}</span><h1>{title}</h1>{desc && <p>{desc}</p>}</div>{actions && <div className="section-actions">{actions}</div>}</div>
}

export function Metric({ icon: Icon, label, value, sub }) {
  return <article className="metric"><div className="metric-icon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div></article>
}

export function SearchBar({ value, onChange, placeholder = 'Rechercher' }) {
  return <div className="searchbar"><Search size={17}/><input aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/></div>
}

export function Table({ headers, rows }) {
  if (!rows?.length) return <Empty/>
  return <div className="table-wrap" tabIndex="0" role="region" aria-label="Tableau, défilement horizontal disponible"><table><thead><tr>{headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
}

export function Info({ label, value }) {
  return <div className="info-row"><span>{label}</span><div>{value}</div></div>
}

export function ConfirmModal({ open, title, text, confirmLabel = 'Confirmer', danger = false, onClose, onConfirm, children }) {
  if (!open) return null
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h3>{title}</h3>{text && <p>{text}</p>}</div><button type="button" onClick={onClose}><X size={18}/></button></div>{children}<div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></div></div>
}
