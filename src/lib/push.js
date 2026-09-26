function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

let serviceWorkerPromise = null

export function getPushEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ios: false, standalone: false, supported: false, requiresInstall: false, permission: 'unsupported' }
  }
  const ua = navigator.userAgent || ''
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true
  const notifications = 'Notification' in window
  const serviceWorker = 'serviceWorker' in navigator
  const pushManager = 'PushManager' in window
  return {
    ios,
    standalone,
    notifications,
    serviceWorker,
    pushManager,
    supported: notifications && serviceWorker && pushManager,
    requiresInstall: ios && !standalone,
    permission: notifications ? window.Notification.permission : 'unsupported',
  }
}

export function preparePushSupport() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!serviceWorkerPromise) {
    serviceWorkerPromise = navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch(error => {
        serviceWorkerPromise = null
        throw error
      })
  }
  return serviceWorkerPromise
}

export async function showPushReadyNotification({
  title = 'Notifications One Market activées',
  body = 'Vous recevrez désormais les alertes importantes.',
  link = '/',
} = {}) {
  if (typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return false
  const registration = await preparePushSupport()
  if (!registration) return false
  await registration.showNotification(title, {
    body,
    icon: 'https://res.cloudinary.com/nks-services/image/upload/v1788106209/one-market-logo.webp',
    badge: 'https://res.cloudinary.com/nks-services/image/upload/v1788106209/one-market-logo.webp',
    tag: 'one-market-push-ready',
    data: { link },
  })
  return true
}

export async function ensurePushSubscription({ supabase, userId, app = 'erp' }) {
  if (!userId || typeof window === 'undefined') return false

  const environment = getPushEnvironment()
  if (environment.requiresInstall) throw new Error('PUSH_IOS_INSTALL_REQUIRED')
  if (!environment.supported) throw new Error('PUSH_UNSUPPORTED')

  // Must stay directly in the click/tap call stack when permission is still "default".
  let permission = window.Notification.permission
  if (permission === 'default') permission = await window.Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await preparePushSupport()
  if (!registration) throw new Error('PUSH_SERVICE_WORKER_UNAVAILABLE')

  const { data: settings, error: settingError } = await supabase
    .from('marketplace_settings')
    .select('value')
    .eq('key', 'notifications')
    .maybeSingle()
  if (settingError) throw settingError

  const publicKey = settings?.value?.vapid_public_key
  if (!publicKey) throw new Error('PUSH_CONFIG_MISSING')

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('PUSH_SUBSCRIPTION_INVALID')

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    app,
    endpoint: subscription.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    is_active: true,
    user_agent: navigator.userAgent.slice(0, 500),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error

  window.localStorage.setItem(`om_push_enabled_${app}`, '1')
  return true
}

export function ensureCourierPushSubscription({ supabase, userId }) {
  return ensurePushSubscription({ supabase, userId, app: 'courier' })
}
