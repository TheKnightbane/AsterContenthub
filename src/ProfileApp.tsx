import { useEffect, useState } from 'react';
import App from './App';
import SetupWizard from './SetupWizard';
import { needsSetup, saveSetup, setupState } from './setup';
import { activeProfile, profiles, selectProfile } from './profiles';
export default function ProfileApp(){const [profile,setProfile]=useState(activeProfile);const [setup,setSetup]=useState(needsSetup);useEffect(()=>{if(!setup&&!setupState())saveSetup('complete',3);const open=()=>{saveSetup('in-progress',0);setSetup(true);};window.addEventListener('aster:open-setup',open);return()=>window.removeEventListener('aster:open-setup',open);},[setup]);useEffect(()=>{const refresh=()=>setProfile(current=>profiles().find(p=>p.id===current.id)||activeProfile());window.addEventListener('aster:profiles-changed',refresh);return()=>window.removeEventListener('aster:profiles-changed',refresh);},[]);return setup?<SetupWizard done={()=>setSetup(false)}/>:<App key={profile.id} profile={profile} switchProfile={id=>{selectProfile(id);setProfile(activeProfile());}}/>;}
