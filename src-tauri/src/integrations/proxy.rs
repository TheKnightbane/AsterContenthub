use super::*;
use tokio::{io::{AsyncReadExt,AsyncWriteExt},net::{TcpListener,TcpStream}};
use std::{collections::{HashMap,VecDeque},sync::{Arc,Mutex,atomic::{AtomicUsize,Ordering}}};
use sha2::{Digest,Sha256};
static ACTIVE:AtomicUsize=AtomicUsize::new(0);
struct Lease;
impl Drop for Lease{fn drop(&mut self){ACTIVE.fetch_sub(1,Ordering::Relaxed);}}
struct Routes{map:HashMap<String,String>,order:VecDeque<String>}
impl Routes{fn add(&mut self,url:String)->String{let key=format!("{:x}",Sha256::digest(url.as_bytes()));if !self.map.contains_key(&key){self.map.insert(key.clone(),url);self.order.push_back(key.clone());while self.order.len()>10000{if let Some(old)=self.order.pop_front(){self.map.remove(&old);}}}key}}
pub async fn start(upstream:String,headers:HeaderMap)->Result<String,String>{
    http_url(&upstream)?;
    if ACTIVE.fetch_add(1,Ordering::Relaxed)>=32{ACTIVE.fetch_sub(1,Ordering::Relaxed);return Err("Too many private playback sessions. Restart Aster to clear old sessions.".into());}
    let lease=Lease;
    let listener=TcpListener::bind("127.0.0.1:0").await.map_err(|_|"Could not open the local media bridge.")?;
    let address=listener.local_addr().map_err(|_|"Local media bridge is unavailable.")?;
    let prefix=format!("/{}",uuid::Uuid::new_v4().simple());let url=format!("http://{address}{prefix}/stream");
    let origin=http_url(&upstream)?.origin().ascii_serialization();
    let routes=Arc::new(Mutex::new(Routes{map:HashMap::from([("stream".into(),upstream)]),order:VecDeque::new()}));
    let prefix=Arc::new(prefix);let headers=Arc::new(headers);
    tauri::async_runtime::spawn(async move{
        let _lease=lease;let expires=tokio::time::Instant::now()+Duration::from_secs(6*60*60);
        while let Ok(Ok((stream,_)))=tokio::time::timeout_at(expires,listener.accept()).await{
            let p=prefix.clone();let routes=routes.clone();let h=headers.clone();let origin=origin.clone();let local=format!("http://{address}{p}");
            tauri::async_runtime::spawn(async move{let _=tokio::time::timeout(Duration::from_secs(6*60*60),serve(stream,&p,&local,&routes,&origin,&h)).await;});
        }
    });Ok(url)
}
async fn serve(mut socket:TcpStream,prefix:&str,local:&str,routes:&Mutex<Routes>,origin:&str,headers:&HeaderMap)->Result<(),String>{
    let mut request=Vec::new();let mut buf=[0u8;2048];
    loop{let n=tokio::time::timeout(Duration::from_secs(10),socket.read(&mut buf)).await.map_err(|_|"Timed out")?.map_err(|_|"Read failed")?;if n==0{return Ok(());}request.extend_from_slice(&buf[..n]);if request.len()>16384{return Ok(());}if request.windows(4).any(|w|w==b"\r\n\r\n"){break;}}
    let text=String::from_utf8_lossy(&request);let mut lines=text.split("\r\n");let first:Vec<_>=lines.next().unwrap_or("").split_whitespace().collect();
    if first.len()!=3||!["GET","HEAD"].contains(&first[0])||!first[1].starts_with(&format!("{prefix}/")){let _=socket.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;return Ok(());}
    let key=&first[1][prefix.len()+1..];let upstream=routes.lock().map_err(|_|"Route unavailable")?.map.get(key).cloned();let Some(upstream)=upstream else{let _=socket.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;return Ok(());};
    let method=if first[0]=="HEAD"{Method::HEAD}else{Method::GET};
    let range=lines.filter_map(|line|line.split_once(':')).find(|(name,_)|name.eq_ignore_ascii_case("range")).map(|(_,v)|v.trim().to_owned());
    if range.as_ref().is_some_and(|v|v.len()>100||!v.starts_with("bytes=")||!v[6..].bytes().all(|b|b.is_ascii_digit()||b==b'-'||b==b',')){return Ok(());}
    let client=Client::builder().connect_timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Client failed")?;
    let mut current=http_url(&upstream)?;let mut response=None;
    for _ in 0..6{
        let mut req=client.request(method.clone(),current.clone());if current.origin().ascii_serialization()==origin{req=req.headers(headers.clone());}if let Some(ref r)=range{req=req.header("Range",r);}
        let result=req.send().await.map_err(|_|"Media source is unavailable")?;
        if result.status().is_redirection(){let location=result.headers().get("location").and_then(|h|h.to_str().ok()).ok_or("Missing redirect")?;current=http_url(current.join(location).map_err(|_|"Invalid redirect")?.as_str())?;continue;}
        response=Some(result);break;
    }
    let Some(mut response)=response else{return Ok(());};
    let playlist=current.path().to_ascii_lowercase().ends_with(".m3u8")||response.headers().get("content-type").and_then(|v|v.to_str().ok()).is_some_and(|v|v.contains("mpegurl"));
    if playlist&&response.status().is_success()&&method==Method::GET{
        let data=bytes(response,2*1024*1024).await?;let text=String::from_utf8_lossy(&data);let rewritten=rewrite_playlist(&text,&current,local,routes)?;
        let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",rewritten.len());socket.write_all(header.as_bytes()).await.map_err(|_|"Write failed")?;socket.write_all(rewritten.as_bytes()).await.map_err(|_|"Write failed")?;return Ok(());
    }
    let status=response.status();let mut out=format!("HTTP/1.1 {} {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n",status.as_u16(),status.canonical_reason().unwrap_or("Response"));
    for name in ["content-type","content-length","content-range","accept-ranges"]{if let Some(value)=response.headers().get(name).and_then(|v|v.to_str().ok()){out.push_str(&format!("{name}: {value}\r\n"));}}
    out.push_str("\r\n");socket.write_all(out.as_bytes()).await.map_err(|_|"Write failed")?;
    if method==Method::HEAD{return Ok(());}
    while let Some(chunk)=response.chunk().await.map_err(|_|"Media interrupted")?{if socket.write_all(&chunk).await.is_err(){break;}}Ok(())
}
fn rewrite_playlist(text:&str,root:&Url,local:&str,routes:&Mutex<Routes>)->Result<String,String>{
    let map=|value:&str|->Result<String,String>{let url=root.join(value).map_err(|_|"Invalid HLS media URL")?;http_url(url.as_str())?;let key=routes.lock().map_err(|_|"Route unavailable")?.add(url.to_string());Ok(format!("{local}/{key}"))};
    let mut lines=Vec::new();for raw in text.lines(){let line=raw.trim();if line.is_empty(){lines.push(String::new());}else if !line.starts_with('#'){lines.push(map(line)?);}else if line.contains("URI=\""){let mut out=String::new();let mut rest=line;while let Some(index)=rest.find("URI=\""){out.push_str(&rest[..index+5]);rest=&rest[index+5..];let end=rest.find('"').ok_or("Invalid HLS URI")?;out.push_str(&map(&rest[..end])?);out.push('"');rest=&rest[end+1..];}out.push_str(rest);lines.push(out);}else{lines.push(line.into());}}
    Ok(lines.join("\n")+"\n")
}
