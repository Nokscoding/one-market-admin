import { BellRing, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ensurePushSubscription } from '../lib/push'
import { supabase } from '../lib/supabase'

const DISMISS_KEY = 'om_erp_push_prompt_dismissed_at'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

export default function PushPermissionPrompt() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined' || !('Notification' in window)) return undefined
    if (window.Notification.permission === 'granted') {
      ensurePushSubscription({ supabase, userId: user.id, app: 'erp' }).catch(() => {})
      return undefined
    }
    if (window.Notification.permission === 'denied') return undefined
    const dismissed = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissed && Date.now() - dismissed < DISMISS_MS) return undefined
    const timer = window.setTimeout(() => setVisible(true), 3500)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  async function enable() {
    if (!user?.id) return
    setBusy(true)
    try {
      await ensurePushSubscription({ supabase, userId: user.id, app: 'erp' })
      window.localStorage.removeItem(DISMISS_KEY)
      setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return <aside className="erp-push-prompt" role="dialog" aria-label="Activer les notifications ERP">
    <button className="erp-push-close" type="button" onClick={dismiss} aria-label="Fermer"><X size={16}/></button>
    <span className="erp-push-icon"><BellRing size={22}/></span>
    <div><strong>Activer les notifications ERP ?</strong><p>Recevez les nouvelles commandes, plaintes, validations et alertes importantes.</p></div>
    <div className="erp-push-actions"><button className="btn primary" type="button" onClick={enable} disabled={busy}>{busy ? 'Activation…' : 'Activer'}</button><button className="btn ghost" type="button" onClick={dismiss}>Plus tard</button></div>
  </aside>
}
