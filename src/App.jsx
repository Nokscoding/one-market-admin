import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { Loader } from './components/UI'
import HomePromotionsPage from './components/HomePromotionsSettings'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { UserDetailPage, UsersPage } from './pages/UsersPage'
import { SellerDetailPage, SellersPage } from './pages/SellersPage'
import { ProductsPage, StoresPage } from './pages/MarketplacePage'
import { DeliveryPage, OrderDetailPage, OrdersPage } from './pages/OperationsPage'
import { ConversationsPage, SupportPage, TicketDetailPage } from './pages/SupportPage'
import { FinancePage, SubscriptionsPage } from './pages/FinancePage'
import { AuditPage, SettingsPage, StaffPage } from './pages/SystemPage'

function AccessGate() {
  const { loading, user, staff, signOut } = useAuth()
  if (loading) return <Loader fullscreen/>
  if (!user) return <Navigate to="/login" replace/>
  if (!staff || staff.status !== 'active') return <div className="screen-center"><ShieldCheck size={42}/><h2>Accès non autorisé</h2><p>Ce compte ne possède pas d’accès actif au One Market ERP.</p><button className="btn primary" type="button" onClick={signOut}>Se déconnecter</button></div>
  return <Outlet/>
}

export default function App() {
  const { user, staff, loading } = useAuth()

  return <Routes>
    <Route path="/login" element={loading ? <Loader fullscreen/> : user && staff?.status === 'active' ? <Navigate to="/" replace/> : <LoginPage/>}/>
    <Route element={<AccessGate/>}>
      <Route element={<Layout/>}>
        <Route index element={<DashboardPage/>}/>
        <Route path="users" element={<UsersPage/>}/>
        <Route path="users/:id" element={<UserDetailPage/>}/>
        <Route path="sellers" element={<SellersPage/>}/>
        <Route path="sellers/:id" element={<SellerDetailPage/>}/>
        <Route path="stores" element={<StoresPage/>}/>
        <Route path="products" element={<ProductsPage/>}/>
        <Route path="promotions" element={<HomePromotionsPage/>}/>
        <Route path="orders" element={<OrdersPage/>}/>
        <Route path="orders/:id" element={<OrderDetailPage/>}/>
        <Route path="delivery" element={<DeliveryPage/>}/>
        <Route path="support" element={<SupportPage/>}/>
        <Route path="support/:id" element={<TicketDetailPage/>}/>
        <Route path="conversations" element={<ConversationsPage/>}/>
        <Route path="finance" element={<FinancePage/>}/>
        <Route path="subscriptions" element={<SubscriptionsPage/>}/>
        <Route path="staff" element={<StaffPage/>}/>
        <Route path="audit" element={<AuditPage/>}/>
        <Route path="settings" element={<SettingsPage/>}/>
        <Route path="403" element={<div className="screen-center"><h2>403</h2><p>Vous n’avez pas la permission d’accéder à cette section.</p></div>}/>
        <Route path="*" element={<div className="screen-center"><h2>404</h2><p>Page ERP introuvable.</p></div>}/>
      </Route>
    </Route>
  </Routes>
}
