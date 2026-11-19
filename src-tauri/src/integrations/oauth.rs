use super::*;
use std::{collections::HashMap,sync::{Mutex,OnceLock}};
#[derive(Clone)]
struct Pending{provider:String,config:Connection,device_code:String,expires:u64,interval:u64,next_poll:u64}
static PENDING:OnceLock<Mutex<HashMap<String,Pending>>>=OnceLock::new();
fn sessions()->&'static Mutex<HashMap<String,Pending>>{PENDING.get_or_init(||Mutex::new(HashMap::new()))}
static REFRESH:OnceLock<tokio::sync::Mutex<()>>=OnceLock::new();
pub async fn fresh(p:&str)->Result<Connection,String>{
    supported(p)?;let _guard=REFRESH.get_or_init(||tokio::sync::Mutex::new(())).lock().await;let mut c=load(p)?;
    if ["trakt","simkl"].contains(&p)&&!c.refresh_token.is_empty()&&c.expires_at<=now()+90{
        let path=if p=="simkl"{"oauth2/token"}else{"oauth/token"};
        let mut body=json!({"grant_type":"refresh_token","client_id":c.client_id,"refresh_token":c.refresh_token});if !c.client_secret.is_empty(){body["client_secret"]=json!(c.client_secret);}
        let response=client()?.post(endpoint(p,&c,path)?).json(&body).send().await.map_err(|_|"Could not refresh sign-in.")?;
        if !response.status().is_success(){return Err("Sign-in expired. Reconnect this tracker in Settings.".into());}
        let data:Value=serde_json::from_slice(&bytes(response,256*1024).await?).map_err(|_|"Invalid authorization response.")?;
        c.token=data["access_token"].as_str().ok_or("Tracker did not return a token.")?.into();if let Some(token)=data["refresh_token"].as_str(){c.refresh_token=token.into();}c.expires_at=now()+data["expires_in"].as_u64().unwrap_or(604800);save(p,&c)?;
    }Ok(c)
}
#[tauri::command]
pub async fn integration_auth_begin(provider:String,mut config:Connection)->Result<Value,String>{
    config.client_id=config.client_id.trim().into();if config.client_secret.len()>4096||config.client_secret.contains(['\r','\n']){return Err("Invalid client registration.".into());}
    if !["trakt","simkl"].contains(&provider.as_str())||config.client_id.is_empty()||config.client_id.len()>500{return Err("Enter your registered tracker app Client ID.".into());}
    let mut request=client()?.post(endpoint(&provider,&config,if provider=="simkl"{"oauth2/device"}else{"oauth/device/code"})?);
    if provider=="simkl"{request=request.form(&[("client_id",config.client_id.as_str()),("scope","media:read media:write")]);}else{request=request.json(&json!({"client_id":config.client_id}));}
    let response=request.send().await.map_err(|_|"Could not start sign-in.")?;if !response.status().is_success(){return Err("The tracker rejected this app registration. Check Client ID and app type.".into());}
    let data:Value=serde_json::from_slice(&bytes(response,256*1024).await?).map_err(|_|"Invalid authorization response.")?;
    let device_code=data["device_code"].as_str().ok_or("No device code returned.")?.to_owned();
    let verification=data["verification_uri_complete"].as_str().or(data["verification_uri"].as_str()).or(data["verification_url"].as_str()).ok_or("No sign-in URL returned.")?;
    let url=http_url(verification)?;let host=url.host_str().unwrap_or("");if url.scheme()!="https"||!["simkl.com","trakt.tv","app.trakt.tv"].contains(&host){return Err("Unexpected sign-in destination.".into());}
    let session=uuid::Uuid::new_v4().to_string();let interval=data["interval"].as_u64().unwrap_or(5).clamp(5,60);let expires_in=data["expires_in"].as_u64().unwrap_or(900).min(3600);
    let mut map=sessions().lock().map_err(|_|"Authorization state unavailable.")?;map.retain(|_,p|p.expires>now());if map.len()>10{return Err("Too many pending sign-ins. Finish or cancel one first.".into());}
    map.insert(session.clone(),Pending{provider,config,device_code,expires:now()+expires_in,interval,next_poll:now()+interval});
    Ok(json!({"sessionId":session,"userCode":data["user_code"],"verificationUrl":verification,"interval":interval,"expiresIn":expires_in}))
}
#[tauri::command]
pub async fn integration_auth_poll(session_id:String)->Result<Value,String>{
    let p={let mut map=sessions().lock().map_err(|_|"Authorization state unavailable.")?;let pending=map.get_mut(&session_id).ok_or("Sign-in session expired. Start again.")?;if now()>=pending.expires{return Err("Sign-in code expired. Start again.".into());}if now()<pending.next_poll{return Ok(json!({"pending":true,"interval":pending.interval}));}pending.next_poll=now()+pending.interval;pending.clone()};
    let mut body=if p.provider=="trakt"{json!({"code":p.device_code,"client_id":p.config.client_id})}else{json!({"device_code":p.device_code,"client_id":p.config.client_id})};
    if p.provider=="simkl"{body["grant_type"]=json!("urn:ietf:params:oauth:grant-type:device_code");}if !p.config.client_secret.is_empty(){body["client_secret"]=json!(p.config.client_secret);}
    let response=client()?.post(endpoint(&p.provider,&p.config,if p.provider=="simkl"{"oauth2/token"}else{"oauth/device/token"})?).json(&body).send().await.map_err(|_|"Could not check sign-in.")?;
    let status=response.status();let data:Value=serde_json::from_slice(&bytes(response,256*1024).await?).unwrap_or(json!({}));
    if data["error"]=="slow_down"||status.as_u16()==429{if let Ok(mut map)=sessions().lock(){if let Some(pending)=map.get_mut(&session_id){pending.interval=(pending.interval+5).min(60);pending.next_poll=now()+pending.interval;}}return Ok(json!({"pending":true,"interval":p.interval+5}));}
    if data["error"]=="authorization_pending"||(p.provider=="trakt"&&status.as_u16()==400&&data["error"].is_null()){return Ok(json!({"pending":true,"interval":p.interval}));}
    if !status.is_success(){let _=integration_auth_cancel(session_id);return Err("Authorization was denied or expired. Start sign-in again.".into());}
    let mut c=p.config;c.token=data["access_token"].as_str().ok_or("Tracker did not return an access token.")?.into();c.refresh_token=data["refresh_token"].as_str().unwrap_or("").into();c.expires_at=now()+data["expires_in"].as_u64().unwrap_or(604800);c.account="Authorized account".into();
    super::verify(&p.provider,&mut c).await?;if !sessions().lock().map_err(|_|"Authorization state unavailable.")?.contains_key(&session_id){return Err("Sign-in was cancelled.".into());}save(&p.provider,&c)?;let _=integration_auth_cancel(session_id);Ok(json!({"connected":true,"connection":summary(&p.provider,&c)}))
}
#[tauri::command]
pub fn integration_auth_cancel(session_id:String)->Result<(),String>{sessions().lock().map_err(|_|"Authorization state unavailable.")?.remove(&session_id);Ok(())}
