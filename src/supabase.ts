import { createClient } from '@supabase/supabase-js';
import type { SyncRepository } from '../shared/models';
import { validItem } from './storage';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const supabase = url && /^https?:\/\//.test(url) && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: false } }) : null;
/** Explicitly invoked only. Local state stays usable when the network is unavailable. */
export const syncRepository: SyncRepository = {
  async pull(userId) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.from('media_state').select('payload').eq('user_id', userId);
    if (error?.code === 'PGRST205') throw new Error('Cloud sync is not set up for this project yet. Complete the database setup in the README.');
    if (error) throw error;
    return (data ?? []).map(row => row.payload).filter(validItem);
  },
  async push(userId, items) {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!items.length) return;
    const { error } = await supabase.from('media_state').upsert(items.map(item => ({ user_id: userId, media_id: item.media.id, payload: item })), { onConflict: 'user_id,media_id' });
    if (error?.code === 'PGRST205') throw new Error('Cloud sync is not set up for this project yet. Complete the database setup in the README.');
    if (error) throw error;
  }
};


