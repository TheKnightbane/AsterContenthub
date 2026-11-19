export interface LocalProfile { id:string; name:string; cloudId?:string; lastSync?:string }
const KEY='aster.profiles.v1',ACTIVE='aster.active-profile.v1';
export const validProfileId=(id:string)=>id==='default'||/^[a-f0-9-]{36}$/i.test(id);
export function profiles():LocalProfile[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(value)&&value.length)return value.filter(p=>p&&typeof p.id==='string'&&validProfileId(p.id)&&typeof p.name==='string');}catch{/* Migrate the original collection below. */}let name='My profile';try{name=JSON.parse(localStorage.getItem('aster.settings.v1')||'{}').profileName||name;}catch{}return [{id:'default',name}];}
export function activeProfile():LocalProfile{const list=profiles();return list.find(p=>p.id===localStorage.getItem(ACTIVE))||list[0]||{id:'default',name:'My profile'};}
export function profileKey(key:string,id=activeProfile().id){return id==='default'?key:`${key}:profile:${id}`;}
function save(list:LocalProfile[]){localStorage.setItem(KEY,JSON.stringify(list));window.dispatchEvent(new Event('aster:profiles-changed'));}
export function updateProfile(id:string,patch:Partial<Omit<LocalProfile,'id'>>){const list=profiles();save(list.map(p=>p.id===id?{...p,...patch,name:(patch.name??p.name).trim().slice(0,40)||p.name}:p));}
export function createProfile(name:string){const profile={id:crypto.randomUUID(),name:name.trim().slice(0,40)||'New profile'};save([...profiles(),profile]);return profile;}
export function selectProfile(id:string){if(!profiles().some(p=>p.id===id))throw new Error('Profile does not exist.');localStorage.setItem(ACTIVE,id);}
