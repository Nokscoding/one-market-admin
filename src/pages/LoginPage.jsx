import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Loader } from '../components/UI'

export default function LoginPage() {
  const { user, staff, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user && staff?.status === 'active') {
      navigate(staff.staff_role === 'COURIER' ? '/courier' : '/', { replace: true })
    }
  }, [user, staff, navigate])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (authError) setError(authError.message)
    setBusy(false)
  }

  if (loading) return <Loader fullscreen />

  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-mark">OM</div>
      <span>ONE MARKET ERP</span>
      <h1>Administration & Operations</h1>
      <p>Le centre de contrôle interne de One Market.</p>
      <small>Powered by NKS Services</small>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">Accès sécurisé</span>
        <h2>Connexion ERP</h2>
        <p>Personnel NKS et livreurs One Market autorisés.</p>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Mot de passe<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <div className="alert bad">{error}</div>}
        <button className="btn primary full" disabled={busy}><ShieldCheck size={17}/>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </section>
  </main>
}
