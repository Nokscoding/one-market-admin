function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

export async function ensurePushSubscription({ supabase, userId, app = 'erp' }) {
  if (!userId || typeof window === 'undefined') return false
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const { data: settings, error: settingError } = await supabase.from('marketplace_settings').select('value').eq('key', 'notifications').maybeSingle()
  if (settingError) throw settingError
  const publicKey = settings?.value?.vapid_public_key
  if (!publicKey) throw new Error('PUSH_CONFIG_MISSING')

  let permission = window.Notification.permission
  if (permission === 'default') permission = await window.Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  }

  const json = subscription.toJSON()
  const payload = {
    user_id: userId,
    app,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    is_active: true,
    user_agent: navigator.userAgent.slice(0, 500),
    updated_at: new Date().toISOString(),
  }
  if (!payload.p256dh || !payload.auth) throw new Error('PUSH_SUBSCRIPTION_INVALID')

  const { error } = await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' })
  if (error) throw error
  window.localStorage.setItem(`om_push_enabled_${app}`, '1')
  return true
}
