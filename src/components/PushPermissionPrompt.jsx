import { BellRing, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ensurePushSubscription, getPushEnvironment, preparePushSupport, showPushReadyNotification } from '../lib/push'
import { supabase } from '../lib/supabase'

const DISMISS_KEY = 'om_erp_push_prompt_dismissed_at'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

export default function PushPermissionPrompt() {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return undefined

    preparePushSupport().catch(() => {})
    const environment = getPushEnvironment()

    if (environment.requiresInstall) {
      const timer = window.setTimeout(() => {
        setMessage('Sur iPhone/iPad, ajoutez d’abord One Market ERP à l’écran d’accueil avec Partager → Sur l’écran d’accueil. Ouvrez ensuite l’icône installée et appuyez sur Activer.')
        setVisible(true)
      }, 1800)
      return () => window.clearTimeout(timer)
    }

    if (!environment.supported) {
      const timer = window.setTimeout(() => {
        setMessage('Ce navigateur ne permet pas les notifications push. Utilisez Safari/Chrome récent ou installez le site comme application sur iPhone.')
        setVisible(true)
      }, 1800)
      return () => window.clearTimeout(timer)
    }

    if (environment.permission === 'granted') {
      ensurePushSubscription({ supabase, userId: user.id, app: 'erp' }).catch(() => {})
      return undefined
    }

    const dismissed = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissed && Date.now() - dismissed < DISMISS_MS) return undefined

    const timer = window.setTimeout(() => {
      if (environment.permission === 'denied') {
        setMessage('Les notifications sont actuellement bloquées. Réactivez-les dans les autorisations du site ou de l’application, puis revenez ici.')
      }
      setVisible(true)
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  async function enable() {
    if (!user?.id || busy) return

    const environment = getPushEnvironment()
    if (environment.requiresInstall) {
      setMessage('Sur iPhone/iPad : Partager → Sur l’écran d’accueil → Ajouter. Ouvrez ensuite One Market ERP depuis l’icône installée et appuyez à nouveau sur Activer.')
      return
    }
    if (!environment.supported) {
      setMessage('Les notifications push ne sont pas disponibles dans ce navigateur.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const enabled = await ensurePushSubscription({ supabase, userId: user.id, app: 'erp' })
      if (enabled) {
        window.localStorage.removeItem(DISMISS_KEY)
        await showPushReadyNotification({
          title: 'Notifications ERP activées',
          body: 'Les nouvelles commandes, validations et alertes pourront maintenant apparaître sur cet appareil.',
          link: '/',
        }).catch(() => {})
        setMessage('Notifications activées. Une notification test vient d’être envoyée sur cet appareil.')
        window.setTimeout(() => setVisible(false), 2200)
      } else if (window.Notification?.permission === 'denied') {
        setMessage('L’autorisation est bloquée. Ouvrez les paramètres du site/appareil, autorisez les notifications puis réessayez.')
      } else {
        setMessage('L’autorisation système n’a pas été accordée. Appuyez de nouveau sur Activer si vous souhaitez les recevoir.')
      }
    } catch (activationError) {
      const raw = String(activationError?.message || '')
      if (raw.includes('PUSH_IOS_INSTALL_REQUIRED')) {
        setMessage('Sur iPhone/iPad, installez d’abord One Market ERP sur l’écran d’accueil puis ouvrez l’application installée.')
      } else if (raw.includes('PUSH_UNSUPPORTED')) {
        setMessage('Ce navigateur ne prend pas en charge les notifications push.')
      } else if (raw.includes('PUSH_CONFIG_MISSING')) {
        setMessage('La configuration push One Market est momentanément indisponible.')
      } else {
        setMessage('Impossible d’activer les notifications pour le moment. Réessayez dans quelques instants.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return <aside className="erp-push-prompt" role="dialog" aria-label="Activer les notifications ERP">
    <button className="erp-push-close" type="button" onClick={dismiss} aria-label="Fermer"><X size={16}/></button>
    <span className="erp-push-icon"><BellRing size={22}/></span>
    <div><strong>Activer les notifications ERP ?</strong><p>Recevez les nouvelles commandes, plaintes, validations et alertes importantes, même lorsque l’onglet n’est pas ouvert.</p></div>
    {message && <div className="erp-push-message" role="status">{message}</div>}
    <div className="erp-push-actions"><button className="btn primary" type="button" onClick={enable} disabled={busy}>{busy ? 'Activation…' : 'Activer'}</button><button className="btn ghost" type="button" onClick={dismiss}>Plus tard</button></div>
  </aside>
}
