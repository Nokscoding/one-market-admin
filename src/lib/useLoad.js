import { useCallback, useEffect, useState } from 'react'
import { adminUserError, logAdminError } from './userErrors'

export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (loadError) {
      logAdminError('load', loadError)
      setError(adminUserError(loadError, 'Impossible de charger ces informations. Réessayez.'))
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}
