import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { dateTime } from '../lib/format'

export default function AdminNotifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user?.id) return undefined
    let active = true
    supabase.from('admin_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (active) setItems(data || []) })

    const channel = supabase.channel(`erp-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications', filter: `user_id=eq.${user.id}` }, payload => {
        setItems(current => current.some(item => item.id === payload.new.id) ? current : [payload.new, ...current].slice(0, 30))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_notifications', filter: `user_id=eq.${user.id}` }, payload => {
        setItems(current => current.map(item => item.id === payload.new.id ? payload.new : item))
      })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [user?.id])

  const unread = useMemo(() => items.filter(item => !item.is_read).length, [items])

  async function openItem(item) {
    setOpen(false)
    if (!item.is_read) {
      await supabase.from('admin_notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', user.id)
      setItems(current => current.map(row => row.id === item.id ? { ...row, is_read: true } : row))
    }
    if (item.link) navigate(item.link)
  }

  async function markAll() {
    if (!unread) return
    await supabase.from('admin_notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setItems(current => current.map(item => ({ ...item, is_read: true })))
  }

  return <div className="admin-notifications">
    <button className="notification-trigger" type="button" aria-label="Notifications ERP" onClick={() => setOpen(value => !value)}><Bell size={18}/>{unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}</button>
    {open && <div className="notification-popover">
      <div className="notification-popover-head"><div><strong>Notifications</strong><span>{unread} non lue{unread > 1 ? 's' : ''}</span></div><button type="button" onClick={markAll}><CheckCheck size={16}/> Tout lire</button></div>
      <div className="notification-list">{items.length ? items.map(item => <button type="button" key={item.id} className={item.is_read ? '' : 'unread'} onClick={() => openItem(item)}><strong>{item.title}</strong><span>{item.body}</span><small>{dateTime(item.created_at)}</small></button>) : <div className="notification-empty">Aucune notification.</div>}</div>
    </div>}
  </div>
}
