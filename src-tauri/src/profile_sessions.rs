use serde::{Deserialize,Serialize};
#[derive(Deserialize,Serialize)]
struct Manifest { generation:String, count:usize }
fn entry(id:&str,suffix:&str)->Result<keyring::Entry,String>{
    if id!="default"&&(id.len()!=36||uuid::Uuid::parse_str(id).is_err()){return Err("Invalid profile.".into());}
    keyring::Entry::new("com.aster.contenthub",&format!("profile-session:{id}{suffix}")).map_err(|_|"Windows Credential Manager is unavailable.".into())
}
fn manifest(id:&str)->Result<Option<Manifest>,String>{match entry(id,"")?.get_password(){Ok(value)=>{let value:Manifest=serde_json::from_str(&value).map_err(|_|"Saved sync session is invalid.")?;if uuid::Uuid::parse_str(&value.generation).is_err()||value.count==0||value.count>32{return Err("Saved sync session is invalid.".into());}Ok(Some(value))},Err(keyring::Error::NoEntry)=>Ok(None),Err(_)=>Err("Could not read this device's sync session.".into())}}
fn cleanup(id:&str,value:&Manifest){for index in 0..value.count{if let Ok(item)=entry(id,&format!(":{}:{index}",value.generation)){let _=item.delete_credential();}}}
#[tauri::command]
pub fn profile_session_get(profile_id:String)->Result<Option<String>,String>{
    let Some(saved)=manifest(&profile_id)? else{return Ok(None)};let mut bytes=Vec::new();
    for index in 0..saved.count{bytes.extend(entry(&profile_id,&format!(":{}:{index}",saved.generation))?.get_secret().map_err(|_|"Saved sync session is incomplete. Reconnect this profile.")?);}
    String::from_utf8(bytes).map(Some).map_err(|_|"Saved sync session is invalid.".into())
}
#[tauri::command]
pub fn profile_session_set(profile_id:String,value:String)->Result<(),String>{
    if value.is_empty()||value.len()>65536||serde_json::from_str::<serde_json::Value>(&value).is_err(){return Err("Invalid sync session.".into());}
    let old=manifest(&profile_id)?;let generation=uuid::Uuid::new_v4().to_string();let next=Manifest{generation,count:value.len().div_ceil(2048)};
    for (index,bytes) in value.as_bytes().chunks(2048).enumerate(){if entry(&profile_id,&format!(":{}:{index}",next.generation))?.set_secret(bytes).is_err(){cleanup(&profile_id,&next);return Err("Could not save this device's sync session.".into());}}
    if entry(&profile_id,"")?.set_password(&serde_json::to_string(&next).map_err(|_|"Invalid sync session.")?).is_err(){cleanup(&profile_id,&next);return Err("Could not save this device's sync session.".into());}
    if let Some(old)=old{cleanup(&profile_id,&old);}Ok(())
}
#[tauri::command]
pub fn profile_session_remove(profile_id:String)->Result<(),String>{let old=manifest(&profile_id)?;match entry(&profile_id,"")?.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>{if let Some(old)=old{cleanup(&profile_id,&old);}Ok(())},Err(_)=>Err("Could not remove this device's sync session.".into())}}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn rejects_invalid_profile_keys_and_session_payloads(){assert!(entry("../private","").is_err());assert!(profile_session_set("default".into(),"invalid".into()).is_err());}
    #[test]#[ignore="Writes and removes an isolated fixture in Windows Credential Manager"]
    fn securely_roundtrips_sessions_larger_than_one_windows_credential(){let id=uuid::Uuid::new_v4().to_string();let text=serde_json::json!({"fixture":"é".repeat(6000)}).to_string();profile_session_set(id.clone(),text.clone()).unwrap();assert_eq!(profile_session_get(id.clone()).unwrap(),Some(text));profile_session_set(id.clone(),"{}".into()).unwrap();assert_eq!(profile_session_get(id.clone()).unwrap(),Some("{}".into()));profile_session_remove(id.clone()).unwrap();assert_eq!(profile_session_get(id).unwrap(),None);}
}
