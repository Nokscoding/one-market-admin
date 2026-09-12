import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BadgeCheck, CircleDollarSign, ClipboardList, Headphones, LayoutDashboard, LogOut,
  Menu, MessageSquare, Package, Settings, ShoppingBag, Store, Truck, UserCog, Users, X, Zap, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/roles'
import AdminNotifications from './AdminNotifications'
import PushPermissionPrompt from './PushPermissionPrompt'

const NAV = [
  ['/', LayoutDashboard, 'Tableau de bord', null],
  ['/users', Users, 'Utilisateurs', 'users.view'],
  ['/sellers', BadgeCheck, 'Vendeurs', 'sellers.view'],
  ['/stores', Store, 'Boutiques', 'stores.view'],
  ['/products', ShoppingBag, 'Produits', 'products.view'],
  ['/orders', Package, 'Commandes', 'orders.view'],
  ['/delivery', Truck, 'Livraisons', 'delivery.view'],
  ['/support', Headphones, 'Signalements', 'support.view'],
  ['/conversations', MessageSquare, 'Conversations', 'conversations.view'],
  ['/finance', CircleDollarSign, 'Finances', 'finance.view'],
  ['/subscriptions', Zap, 'Abonnements', 'subscriptions.view'],
  ['/staff', UserCog, 'Employés ERP', 'staff.view'],
  ['/audit', ClipboardList, 'Journal d’activité', 'audit.view'],
  ['/settings', Settings, 'Paramètres', 'settings.view'],
]

export default function Layout() {
  const { staff, can, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isSuper = staff?.staff_role === 'SUPER_ADMIN'
  const visible = NAV.filter(([, , , permission]) => !permission || can(permission) || isSuper)
  const current = visible.find(([path]) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))

  return <div className="erp-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="side-brand">
        <div className="brand-mark small">OM</div>
        <div><strong>ONE MARKET</strong><span>ERP</span></div>
        <button className="mobile-close" type="button" onClick={() => setOpen(false)}><X size={18}/></button>
      </div>
      <nav>
        {visible.map(([path, Icon, label]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18}/><span>{label}</span></NavLink>)}
      </nav>
      <div className="side-user">
        <div className="avatar">{(staff?.full_name || 'OM').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div>
        <div><strong>{staff?.full_name || 'One Market'}</strong><span>{ROLE_LABELS[staff?.staff_role] || staff?.staff_role}</span></div>
        <button type="button" onClick={signOut} title="Déconnexion"><LogOut size={17}/></button>
      </div>
    </aside>

    <div className="erp-main">
      <header className="topbar">
        <button className="menu-btn" type="button" onClick={() => setOpen(true)}><Menu size={20}/></button>
        <div><strong>{current?.[2] || 'One Market ERP'}</strong><span>Administration & Operations</span></div>
        <div className="topbar-right"><AdminNotifications/><span className="secure-chip"><ShieldCheck size={15}/> Session sécurisée</span></div>
      </header>
      <main className="page"><Outlet/></main>
    </div>
    <PushPermissionPrompt/>
  </div>
}
