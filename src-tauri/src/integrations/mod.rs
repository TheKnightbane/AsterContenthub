use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use reqwest::{Client, Method, Url, header::HeaderMap};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
pub mod browse;
pub mod proxy;
pub mod oauth;
mod resolve;

pub const PROVIDERS: &[&str] = &["torbox","premiumize","alldebrid","pikpak","webdav","jellyfin","emby","plex","jackett","prowlarr","iptv","trakt","simkl","mdblist"];
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
pub struct Connection {
    pub base_url: String, pub token: String, pub username: String, pub password: String, pub user_id: String,
    pub client_id: String, pub client_secret: String, pub refresh_token: String, pub expires_at: u64,
    pub account: String, pub auto_track: bool,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Summary { provider: String, account: String, auto_track: bool, configured: bool }
pub fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
pub fn supported(p: &str) -> Result<(), String> { if PROVIDERS.contains(&p) { Ok(()) } else { Err("Unknown integration.".into()) } }
fn entry(p: &str) -> Result<keyring::Entry,String> { supported(p)?; keyring::Entry::new("com.aster.contenthub", &format!("integration:{p}")).map_err(|_| "Windows Credential Manager is unavailable.".into()) }
pub fn load(p: &str) -> Result<Connection,String> { serde_json::from_str(&entry(p)?.get_password().map_err(|_| "Connect this service in Settings first.")?).map_err(|_| "Saved connection is invalid. Reconnect this service.".into()) }
pub fn save(p: &str, c: &Connection) -> Result<(),String> { entry(p)?.set_password(&serde_json::to_string(c).map_err(|_| "Could not encode connection.")?).map_err(|_| "Could not save the connection securely.".into()) }
pub fn summary(p: &str,c: &Connection) -> Summary { Summary { provider:p.into(), account:c.account.clone(), auto_track:c.auto_track, configured:true } }
pub fn client() -> Result<Client,String> { Client::builder().timeout(Duration::from_secs(25)).redirect(reqwest::redirect::Policy::none()).user_agent("AsterContentHub/0.1.0").build().map_err(|_| "Could not initialize network client.".into()) }
pub fn http_url(s: &str) -> Result<Url,String> {
    let u=Url::parse(s).map_err(|_| "Enter a valid HTTP(S) URL.")?;
    if !["http","https"].contains(&u.scheme()) || u.host_str().is_none() || !u.username().is_empty() || u.password().is_some() || u.fragment().is_some() { return Err("Use an HTTP(S) URL without embedded login details or a fragment.".into()); } Ok(u)
}
pub fn base(provider:&str,c:&Connection) -> Result<Url,String> {
    let fixed=match provider { "torbox"=>Some("https://api.torbox.app/v1/api/"),"premiumize"=>Some("https://www.premiumize.me/api/"),"alldebrid"=>Some("https://api.alldebrid.com/"),"trakt"=>Some("https://api.trakt.tv/"),"simkl"=>Some("https://api.simkl.com/"),"mdblist"=>Some("https://api.mdblist.com/"),_=>None };
    let mut u=http_url(fixed.unwrap_or(&c.base_url))?;
    if provider!="iptv" { if u.query().is_some() { return Err("Enter the server root without query parameters. Put API keys in the key field.".into()); } if !u.path().ends_with('/') { u.set_path(&format!("{}/",u.path())); } } Ok(u)
}
pub fn endpoint(p:&str,c:&Connection,path:&str) -> Result<Url,String> { let root=base(p,c)?; let u=root.join(path.trim_start_matches('/')).map_err(|_| "Invalid provider path.")?; if u.origin()!=root.origin() || !u.path().starts_with(root.path()) {return Err("Provider path leaves the configured server.".into());} Ok(u) }
pub fn id(s:&str) -> Result<&str,String> { if s.is_empty() || s.len()>200 || !s.bytes().all(|b|b.is_ascii_alphanumeric() || b==b'-' || b==b'_') {Err("Invalid media identifier.".into())} else {Ok(s)} }
pub fn value_string(v:&Value)->String { v.as_str().map(str::to_owned).or_else(||v.as_i64().map(|n|n.to_string())).unwrap_or_default() }
pub async fn bytes(mut response:reqwest::Response,limit:usize)->Result<Vec<u8>,String> { let mut out=Vec::new();while let Some(part)=response.chunk().await.map_err(|_|"Incomplete provider response.")? {if out.len()+part.len()>limit{return Err("Provider response exceeds the size limit.".into());}out.extend_from_slice(&part);}Ok(out) }
pub fn authorized(p:&str,c:&Connection,method:Method,mut url:Url)->Result<reqwest::RequestBuilder,String> {
    // This helper is called only with fixed API endpoints or validated server-relative paths.
    if p=="mdblist" {url.query_pairs_mut().append_pair("apikey",&c.token);}
    if p=="simkl" {url.query_pairs_mut().append_pair("client_id",&c.client_id).append_pair("app-name","AsterContentHub").append_pair("app-version","0.1.0");}
    let mut r=client()?.request(method,url).header("Accept","application/json");
    match p {
        "webdav"|"pikpak"=>r=r.basic_auth(&c.username,Some(&c.password)),
        "plex"=>r=r.header("X-Plex-Token",&c.token).header("X-Plex-Client-Identifier","aster-content-hub").header("X-Plex-Product","Aster Content Hub"),
        "jellyfin"|"emby"=>r=r.header("X-Emby-Token",&c.token).header("X-Emby-Authorization","MediaBrowser Client=\"Aster\", Device=\"Windows\", DeviceId=\"aster-content-hub\", Version=\"0.1.0\""),
        "prowlarr"=>r=r.header("X-Api-Key",&c.token),
        "jackett"=>{}, "mdblist"=>{}, "iptv"=>{if !c.username.is_empty(){r=r.basic_auth(&c.username,Some(&c.password));}},
        _=>{r=r.bearer_auth(&c.token);if p=="trakt" {r=r.header("trakt-api-key",&c.client_id).header("trakt-api-version","2");}}
    } Ok(r)
}
pub async fn json_request(p:&str,c:&Connection,method:Method,path:&str,query:&[(&str,String)],body:Option<Value>,form:Option<Vec<(String,String)>>)->Result<Value,String> {
    let mut u=endpoint(p,c,path)?;for (k,v)in query{u.query_pairs_mut().append_pair(k,v);}
    let mut r=authorized(p,c,method,u)?;
    if let Some(b)=body{r=r.json(&b);}if let Some(f)=form{r=r.form(&f);}
    let response=r.send().await.map_err(|_|"Service could not be reached. Check the connection and server address.")?;let status=response.status();
    if !status.is_success(){return Err(format!("Service returned HTTP {}. Check credentials, permissions or account limits.",status.as_u16()));}
    if status.as_u16()==204{return Ok(json!({}));}
    let data:Value=serde_json::from_slice(&bytes(response,8*1024*1024).await?).map_err(|_|"Service returned an invalid JSON response.")?;
    if data["success"]==false || data["status"]=="error" {return Err("The service rejected this request. Check the source, account and service limits.".into());} Ok(data)
}
pub async fn get(p:&str,c:&Connection,path:&str,q:&[(&str,String)])->Result<Value,String>{json_request(p,c,Method::GET,path,q,None,None).await}
pub async fn post(p:&str,c:&Connection,path:&str,body:Value)->Result<Value,String>{json_request(p,c,Method::POST,path,&[],Some(body),None).await}
pub async fn form(p:&str,c:&Connection,path:&str,params:Vec<(String,String)>)->Result<Value,String>{json_request(p,c,Method::POST,path,&[],None,Some(params)).await}

async fn verify(p:&str,c:&mut Connection)->Result<(),String> {
    base(p,c)?;
    match p {
        "webdav"|"pikpak"=>{if c.username.is_empty()||c.password.is_empty(){return Err("Enter your WebDAV username and app password.".into());}browse::dav_list(p,c,"").await?;c.account=c.username.clone();},
        "iptv"=>{let channels=browse::playlist(c).await?;if channels.is_empty(){return Err("The playlist has no supported HTTP(S) channels.".into());}c.account=format!("{} channels",channels.len());},
        "jellyfin"|"emby"=>{
            if c.token.is_empty(){let data=post(p,c,"Users/AuthenticateByName",json!({"Username":c.username,"Pw":c.password})).await?;c.token=data["AccessToken"].as_str().ok_or("Server did not return a session token.")?.into();c.user_id=value_string(&data["User"]["Id"]);}
            id(&c.user_id)?;let data=get(p,c,&format!("Users/{}",c.user_id),&[]).await?;c.account=data["Name"].as_str().unwrap_or("Media server account").into();c.password.clear();
        },
        "plex"=>{let data=get(p,c,"library/sections",&[]).await?;if !data["MediaContainer"].is_object(){return Err("This is not a Plex Media Server response.".into());}c.account="Plex Media Server".into();},
        "jackett"=>{browse::jackett(c,"",true).await?;c.account="Jackett indexers".into();},
        "prowlarr"=>{let data=get(p,c,"api/v1/indexer",&[]).await?;if !data.is_array(){return Err("This is not a Prowlarr response.".into());}c.account=format!("{} indexers",data.as_array().map_or(0,|v|v.len()));},
        "torbox"=>{let data=get(p,c,"user/me",&[]).await?;if !data["data"].is_object(){return Err("TorBox did not return an account.".into());}c.account=data["data"]["email"].as_str().unwrap_or("TorBox account").into();},
        "premiumize"=>{let data=get(p,c,"account/info",&[]).await?;if data["status"]!="success"{return Err("Premiumize rejected these credentials.".into());}c.account=format!("Customer {}",value_string(&data["customer_id"]));},
        "alldebrid"=>{let data=get(p,c,"v4/user",&[]).await?;if data["status"]!="success"{return Err("AllDebrid rejected these credentials.".into());}c.account=data["data"]["user"]["username"].as_str().unwrap_or("AllDebrid account").into();},
        "trakt"=>{let data=get(p,c,"users/settings",&[]).await?;c.account=data["user"]["username"].as_str().ok_or("Trakt account validation failed.")?.into();},
        "simkl"=>{let data=post(p,c,"users/settings",json!({})).await?;c.account=data["user"]["name"].as_str().ok_or("Simkl account validation failed.")?.into();},
        "mdblist"=>{let data=get(p,c,"user",&[]).await?;c.account=data["username"].as_str().or(data["user"]["username"].as_str()).ok_or("MDBList account validation failed.")?.into();},
        _=>return Err("Unknown integration.".into())
    } Ok(())
}
#[tauri::command]
pub fn integration_connections()->Vec<Summary>{PROVIDERS.iter().filter_map(|p|load(p).ok().map(|c|summary(p,&c))).collect()}
#[tauri::command]
pub async fn integration_connect(provider:String,mut config:Connection)->Result<Summary,String>{supported(&provider)?;config.base_url=config.base_url.trim().into();config.token=config.token.trim().into();config.client_id=config.client_id.trim().into();if [&config.token,&config.password,&config.username,&config.client_id,&config.client_secret,&config.base_url].iter().any(|s|s.len()>4096||s.contains(['\r','\n'])){return Err("Connection field is invalid or too long.".into());}verify(&provider,&mut config).await?;save(&provider,&config)?;Ok(summary(&provider,&config))}
#[tauri::command]
pub async fn integration_check(provider:String)->Result<Summary,String>{let mut c=oauth::fresh(&provider).await?;verify(&provider,&mut c).await?;save(&provider,&c)?;Ok(summary(&provider,&c))}
#[tauri::command]
pub fn integration_disconnect(provider:String)->Result<(),String>{match entry(&provider)?.delete_credential(){Ok(_)|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("Could not remove the saved connection.".into())}}
#[tauri::command]
pub async fn integration_browse(provider:String,parent:String,query:String,page:u32)->Result<browse::Page,String>{let c=oauth::fresh(&provider).await?;if parent.len()>2048||query.len()>200||page>10000{return Err("Browse request exceeds the limit.".into());}browse::list(&provider,&c,&parent,&query,page).await}
#[tauri::command]
pub async fn integration_play(provider:String,parent:String,item_id:String)->Result<Value,String>{let c=oauth::fresh(&provider).await?;let (url,headers)=browse::stream(&provider,&c,&parent,&item_id).await?;http_url(&url)?;let playable=if headers.is_empty(){url}else{proxy::start(url,headers).await?};Ok(json!({"url":playable}))}
#[tauri::command]
pub async fn integration_resolve(provider:String,source:String)->Result<Value,String>{let c=oauth::fresh(&provider).await?;let url=resolve::resolve(&provider,&c,&source).await?;Ok(json!({"url":url}))}
#[tauri::command]
pub fn integration_tracking(provider:String,enabled:bool)->Result<(),String>{if !["trakt","simkl"].contains(&provider.as_str()){return Err("Unsupported tracker.".into());}let mut c=load(&provider)?;c.auto_track=enabled;save(&provider,&c)}
#[tauri::command]
pub async fn integration_watched(provider:String,imdb_id:String,watched_at:String)->Result<(),String>{if !["trakt","simkl"].contains(&provider.as_str())||!imdb_id.starts_with("tt")||!imdb_id[2..].bytes().all(|c|c.is_ascii_digit())||imdb_id.len()>20||watched_at.len()>40{return Err("Only identified movies can be synced to this tracker.".into());}let c=oauth::fresh(&provider).await?;let result=post(&provider,&c,"sync/history",json!({"movies":[{"ids":{"imdb":imdb_id},"watched_at":watched_at}]})).await?;if result["not_found"]["movies"].as_array().is_some_and(|v|!v.is_empty()){return Err("The tracker could not identify this movie.".into());}Ok(())}

#[tauri::command]
pub fn integration_open_url(url:String)->Result<(),String>{let u=http_url(&url)?;if u.scheme()!="https"||!["trakt.tv","app.trakt.tv","developer.trakt.tv","simkl.com","api.simkl.org","torbox.app","www.premiumize.me","premiumize.me","alldebrid.com","mypikpak.com","www.mypikpak.com","mdblist.com","api.mdblist.com","jellyfin.org","emby.media","support.plex.tv","github.com","wiki.servarr.com"].contains(&u.host_str().unwrap_or("")){return Err("This help link is not an approved service destination.".into());}open::that_detached(u.as_str()).map_err(|_|"Could not open your browser.".into())}

#[cfg(test)]
mod tests;
