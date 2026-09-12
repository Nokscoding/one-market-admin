import { createClient } from '@supabase/supabase-js'

const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

if (!url || !key) {
  throw new Error('Configuration ERP incomplète : VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont requises.')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
