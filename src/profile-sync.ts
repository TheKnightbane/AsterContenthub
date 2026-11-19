import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { SavedMedia } from '../shared/models';
import { isOpenCinema, validItem } from './storage';
import { updateProfile, type LocalProfile } from './profiles';
const url=import.meta.env.VITE_SUPABASE_URL?.trim(),key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()||import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const cloudAvailable=!!(url&&key);
const clients=new Map<string,SupabaseClient>();
export function profileClient(id:string){
  if(!url||!key)throw new Error('Cloud sync is not configured in this build. Local profiles work offline.');
  let client=clients.get(id);if(!client){client=createClient(url,key,{auth:{persistSession:true,detectSessionInUrl:false,storageKey:`aster.profile-auth.${id}`,storage:{getItem:async name=>isTauri()?await invoke<string|null>('profile_session_get',{profileId:id}):localStorage.getItem(name),setItem:async(name,value)=>{if(isTauri())await invoke('profile_session_set',{profileId:id,value});else localStorage.setItem(name,value);},removeItem:async name=>{if(isTauri())await invoke('profile_session_remove',{profileId:id});else localStorage.removeItem(name);}}}});clients.set(id,client);}return client;
}
function failure(error:{message?:string;code?:string}|null){if(!error)return;if(error.code==='PGRST202'||error.code==='PGRST205')throw new Error('Profile sync needs the updated database setup. Local data is safe.');if(/anonymous.*disabled/i.test(error.message||''))throw new Error('Device sign-in needs to be enabled for this project. Local profiles remain available.');throw new Error(error.message||'Could not connect. Your local collection is safe.');}
async function device(id:string,existing=false){const client=profileClient(id);const {data,error}=await client.auth.getSession();failure(error);if(!data.session){if(existing)throw new Error('This device lost its sync session. Reconnect using a pairing code from another connected device.');const response=await client.auth.signInAnonymously();failure(response.error);}return client;}
export async function enableProfileSync(profile:LocalProfile){const client=await device(profile.id);const {data,error}=await client.rpc('aster_create_profile',{display_name:profile.name});failure(error);if(!data||typeof data.id!=='string')throw new Error('The server returned an invalid profile.');updateProfile(profile.id,{cloudId:data.id});return data.id as string;}
export async function pairingCode(profile:LocalProfile){if(!profile.cloudId)throw new Error('Enable sync for this profile first.');const client=await device(profile.id,true);const {data,error}=await client.rpc('aster_create_pairing_code',{target_profile:profile.cloudId});failure(error);if(!data||typeof data.code!=='string')throw new Error('No pairing code was returned.');return data as {code:string;expiresAt:string};}
export async function pairProfile(profile:LocalProfile,code:string){const normalized=code.replace(/[\s-]/g,'').toUpperCase();if(!/^[A-F0-9]{32}$/.test(normalized))throw new Error('Paste the full pairing code from your other device.');const client=await device(profile.id);const {data,error}=await client.rpc('aster_redeem_pairing_code',{pairing_code:normalized});failure(error);if(!data||typeof data.id!=='string')throw new Error('The pairing code is invalid or expired.');updateProfile(profile.id,{cloudId:data.id,name:data.name||profile.name});return data as {id:string;name:string};}
async function performSync(profile:LocalProfile,local:SavedMedia[]){if(!profile.cloudId)throw new Error('Enable sync or pair this profile first.');const client=await device(profile.id,true);const rows:{payload:unknown}[]=[];for(let offset=0;;offset+=500){const response=await client.from('aster_profile_media').select('payload').eq('profile_id',profile.cloudId).order('media_id').range(offset,offset+499);failure(response.error);rows.push(...(response.data||[]));if(!response.data||response.data.length<500)break;}
  const merged=new Map(local.map(item=>[item.media.id,item]));for(const row of rows){const item=row.payload;if(validItem(item)&&!isOpenCinema(item.media)&&(!merged.has(item.media.id)||item.updatedAt>merged.get(item.media.id)!.updatedAt))merged.set(item.media.id,item);}
  const items=[...merged.values()];for(let offset=0;offset<items.length;offset+=200){const pushed=await client.from('aster_profile_media').upsert(items.slice(offset,offset+200).map(item=>({profile_id:profile.cloudId,media_id:item.media.id,payload:item})),{onConflict:'profile_id,media_id'});failure(pushed.error);}
  const at=new Date().toISOString();updateProfile(profile.id,{lastSync:at});return items;
}


const syncing=new Map<string,Promise<SavedMedia[]>>();
export function syncProfile(profile:LocalProfile,local:SavedMedia[]){const pending=syncing.get(profile.id);if(pending)return pending;const task=performSync(profile,local);syncing.set(profile.id,task);void task.finally(()=>{if(syncing.get(profile.id)===task)syncing.delete(profile.id);}).catch(()=>{});return task;}

