import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bkihicvavawchnkdhuynj.supabase.co'
const supabaseAnonKey = 'sb_publishable__gv4-RXJW5md4xHwAzAQqQ_9knfcD3V'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)