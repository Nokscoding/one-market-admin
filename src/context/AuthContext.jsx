import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  const loadStaff = useCallback(async currentSession => {
    if (!currentSession?.user) {
      setStaff(null)
      setPermissions([])
      return
    }

    const { data } = await supabase
      .from('admin_staff')
      .select('*')
      .eq('user_id', currentSession.user.id)
      .maybeSingle()

    setStaff(data || null)

    if (data?.status === 'active') {
      if (data.staff_role === 'SUPER_ADMIN') {
        setPermissions(['*'])
      } else {
        const { data: rolePermissions } = await supabase
          .from('staff_role_permissions')
          .select('permission')
          .eq('staff_role', data.staff_role)
        setPermissions((rolePermissions || []).map(item => item.permission))
      }
      supabase.rpc('erp_touch_login').catch(() => {})
    } else {
      setPermissions([])
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      return loadStaff(data.session)
    }).finally(() => active && setLoading(false))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      loadStaff(nextSession).finally(() => setLoading(false))
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadStaff])

  const can = useCallback(permission => permissions.includes('*') || permissions.includes(permission), [permissions])

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    staff,
    permissions,
    loading,
    can,
    refresh: () => loadStaff(session),
    signOut: () => supabase.auth.signOut(),
  }), [session, staff, permissions, loading, can, loadStaff])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
