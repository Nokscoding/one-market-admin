const ICON = 'https://res.cloudinary.com/nks-services/image/upload/v1788106209/one-market-logo.webp'

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text?.() || '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'One Market ERP', {
    body: data.body || 'Vous avez une nouvelle notification.',
    icon: ICON,
    badge: ICON,
    tag: data.tag || undefined,
    data: { link: data.link || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification?.data?.link || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const client of windows) {
      if ('focus' in client) {
        client.navigate(link)
        return client.focus()
      }
    }
    return clients.openWindow(link)
  }))
})
