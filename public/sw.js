const ICON = 'https://res.cloudinary.com/nks-services/image/upload/v1788106209/one-market-logo.webp'

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} }
  catch { data = { body: event.data?.text?.() || '' } }

  const title = data.title || 'One Market Livreur'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Vous avez une nouvelle course One Market.',
    icon: ICON,
    badge: ICON,
    tag: data.tag || undefined,
    renotify: true,
    data: { link: data.link || '/courier' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification?.data?.link || '/courier'
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
