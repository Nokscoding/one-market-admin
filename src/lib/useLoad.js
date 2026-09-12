import { useCallback, useEffect, useState } from 'react'

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
      setError(loadError?.message || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}
