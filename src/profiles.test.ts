import {beforeEach,expect,it} from 'vitest';
import {activeProfile,createProfile,profileKey,profiles,selectProfile,updateProfile} from './profiles';
import {loadState,saveState} from './storage';
import {demoCatalog} from './data';
beforeEach(()=>{const values=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)},window:{dispatchEvent:()=>true}});});
it('migrates existing data without renaming storage keys and isolates new profiles',()=>{
  expect(activeProfile().id).toBe('default');expect(profileKey('aster.state.v1')).toBe('aster.state.v1');
  const state=loadState();const media={...demoCatalog[0],id:'existing',demo:false};state.items[media.id]={media,inLibrary:true,favorite:false,updatedAt:new Date().toISOString()};saveState(state);
  const second=createProfile('Second');selectProfile(second.id);expect(loadState().items).toEqual({});
  selectProfile('default');expect(loadState().items.existing.inLibrary).toBe(true);expect(profiles()).toHaveLength(2);
});
it('keeps profile IDs stable when connecting cloud metadata',()=>{updateProfile('default',{name:'Joshua',cloudId:'00000000-0000-4000-8000-000000000001'});expect(activeProfile()).toMatchObject({id:'default',name:'Joshua'});expect(()=>selectProfile('missing')).toThrow();});
