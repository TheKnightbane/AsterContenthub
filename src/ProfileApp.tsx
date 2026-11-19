import { useEffect, useState } from 'react';
import App from './App';
import { activeProfile, profiles, selectProfile } from './profiles';
export default function ProfileApp(){const [profile,setProfile]=useState(activeProfile);useEffect(()=>{const refresh=()=>setProfile(current=>profiles().find(p=>p.id===current.id)||activeProfile());window.addEventListener('aster:profiles-changed',refresh);return()=>window.removeEventListener('aster:profiles-changed',refresh);},[]);return <App key={profile.id} profile={profile} switchProfile={id=>{selectProfile(id);setProfile(activeProfile());}}/>;}
