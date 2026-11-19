use super::*;
use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};
async fn server(responses:Vec<(&'static str,&'static str,&'static str)>)->(String,tauri::async_runtime::JoinHandle<Vec<String>>){
    let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();
    let handle=tauri::async_runtime::spawn(async move{let mut requests=Vec::new();for(status,ct,body)in responses{let(mut socket,_)=tokio::time::timeout(Duration::from_secs(5),listener.accept()).await.unwrap().unwrap();let mut raw=Vec::new();let mut buffer=[0;2048];loop{let n=socket.read(&mut buffer).await.unwrap();if n==0{break;}raw.extend_from_slice(&buffer[..n]);if let Some(end)=raw.windows(4).position(|w|w==b"\r\n\r\n"){let headers=String::from_utf8_lossy(&raw[..end]);let len=headers.lines().find_map(|l|l.split_once(':').filter(|(k,_)|k.eq_ignore_ascii_case("content-length")).and_then(|(_,v)|v.trim().parse::<usize>().ok())).unwrap_or(0);if raw.len()>=end+4+len{break;}}}requests.push(String::from_utf8_lossy(&raw).to_string());let reply=format!("HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());socket.write_all(reply.as_bytes()).await.unwrap();}requests});(format!("http://{address}/"),handle)
}
#[test]
fn credentials_stay_on_official_hosts_and_out_of_public_summaries(){
    let c=Connection{base_url:"https://malicious.example/".into(),token:"fixture-secret".into(),password:"private-password".into(),client_id:"my-client".into(),account:"Test account".into(),..Default::default()};
    for(p,host,path)in[("torbox","api.torbox.app","user/me"),("premiumize","www.premiumize.me","account/info"),("alldebrid","api.alldebrid.com","v4/user"),("trakt","api.trakt.tv","users/settings"),("simkl","api.simkl.com","users/settings"),("mdblist","api.mdblist.com","user")]{let url=endpoint(p,&c,path).unwrap();assert_eq!(url.host_str(),Some(host));let req=authorized(p,&c,Method::GET,url).unwrap().build().unwrap();if ["torbox","premiumize","alldebrid","trakt","simkl"].contains(&p){assert_eq!(req.headers()["authorization"],"Bearer fixture-secret");}}
    let public=serde_json::to_string(&summary("torbox",&c)).unwrap();assert!(!public.contains("fixture-secret"));assert!(!public.contains("private-password"));assert!(!public.contains("malicious"));assert!(supported("../credentials").is_err());assert!(http_url("file:///C:/secret").is_err());assert!(http_url("https://user:pass@example.com/").is_err());
}
#[test]
fn webdav_limits_paths_and_reads_namespaced_listings(){
    let c=Connection{base_url:"https://dav.example/library/".into(),..Default::default()};
    for path in ["../private","/outside/file.mp4","https://other.example/library/a.mp4","%2e%2e/private","a%2fb.mp4"]{assert!(browse::dav_target(&c,path).is_err(),"{path}");}
    let xml=r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/library/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>/library/movie.mp4</d:href><d:propstat><d:prop><d:displayname>Movie &amp; Friends.mp4</d:displayname><d:getcontentlength>42</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>https://other.example/private.mp4</d:href></d:response></d:multistatus>"#;
    let items=browse::parse_dav(&c,"",xml).unwrap();assert_eq!(items.len(),1);assert_eq!(items[0].name,"Movie & Friends.mp4");assert_eq!(items[0].id,"/library/movie.mp4");
}
#[test]
fn playlist_and_indexer_parsers_keep_streams_and_magnets_usable(){
    let root=http_url("https://tv.example/playlist.m3u?key=secret").unwrap();let data="#EXTM3U\n#EXTINF:-1 group-title=\"News\",News One\nlive/news.m3u8\n#EXTINF:-1,Unsafe\nfile:///C:/private\n";
    let channels=browse::parse_m3u(data,&root).unwrap();assert_eq!(channels.len(),1);assert_eq!(channels[0].url,"https://tv.example/live/news.m3u8");assert_eq!(channels[0].group,"News");assert!(!browse::channel_id(&channels[0].url).contains("example"));assert_eq!(browse::channel_id(&channels[0].url).len(),64);
    let xml=r#"<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel><item><title>My movie</title><torznab:attr name="infohash" value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/><torznab:attr name="seeders" value="8"/></item></channel></rss>"#;
    let results=browse::parse_torznab(xml,false).unwrap();assert_eq!(results.len(),1);assert!(results[0].magnet.starts_with("magnet:?xt=urn:btih:"));assert!(results[0].detail.contains('8'));assert!(browse::parse_torznab("<error code=\"100\"/>",false).is_err());
}
#[test]
fn media_servers_authenticate_browse_and_keep_tokens_in_headers(){tauri::async_runtime::block_on(async{
    for provider in ["jellyfin","emby"]{
        let(root,handle)=server(vec![("200 OK","application/json",r#"{"AccessToken":"server-token","User":{"Id":"user123"}}"#),("200 OK","application/json",r#"{"Id":"user123","Name":"Film user"}"#),("200 OK","application/json",r#"{"Items":[{"Id":"movie123","Name":"My Film","Type":"Movie","IsFolder":false,"ProductionYear":2020}],"TotalRecordCount":1}"#)]).await;
        let mut c=Connection{base_url:root,username:"User".into(),password:"test-password".into(),..Default::default()};verify(provider,&mut c).await.unwrap();assert_eq!(c.token,"server-token");assert!(c.password.is_empty());let page=browse::list(provider,&c,"","",0).await.unwrap();assert_eq!(page.items[0].name,"My Film");let(url,headers)=browse::stream(provider,&c,"","movie123").await.unwrap();assert!(!url.contains("server-token"));assert_eq!(headers["x-emby-token"],"server-token");let requests=handle.await.unwrap();assert!(requests[0].contains("AuthenticateByName"));assert!(requests[0].contains("test-password"));assert!(requests[2].to_ascii_lowercase().contains("x-emby-token: server-token"));
    }
})}
#[test]
fn plex_and_webdav_playback_use_private_headers(){tauri::async_runtime::block_on(async{
    let(root,handle)=server(vec![("200 OK","application/json",r#"{"MediaContainer":{"Directory":[{"key":"1","title":"Movies"}]}}"#),("200 OK","application/json",r#"{"MediaContainer":{"Metadata":[{"ratingKey":"99","title":"Local Movie","type":"movie"}]}}"#),("200 OK","application/json",r#"{"MediaContainer":{"Metadata":[{"Media":[{"Part":[{"key":"/library/parts/99/file.mkv"}]}]}]}}"#)]).await;
    let mut c=Connection{base_url:root,token:"plex-secret".into(),..Default::default()};verify("plex",&mut c).await.unwrap();let page=browse::list("plex",&c,"section:1","",0).await.unwrap();assert_eq!(page.items[0].id,"99");let(url,headers)=browse::stream("plex",&c,"section:1","99").await.unwrap();assert!(url.contains("/library/parts/99/"));assert!(!url.contains("plex-secret"));assert_eq!(headers["x-plex-token"],"plex-secret");let requests=handle.await.unwrap();assert!(requests[0].to_ascii_lowercase().contains("accept: application/json"));
    let c=Connection{base_url:"https://dav.example/media/".into(),username:"user".into(),password:"secret".into(),..Default::default()};let(url,headers)=browse::stream("webdav",&c,"","/media/movie.mp4").await.unwrap();assert!(!url.contains("secret"));assert!(headers["authorization"].to_str().unwrap().starts_with("Basic "));
})}
#[test]
fn private_proxy_forwards_ranges_and_drops_credentials_on_cross_origin_redirects(){tauri::async_runtime::block_on(async{
    let destination=TcpListener::bind("127.0.0.1:0").await.unwrap();let dest=destination.local_addr().unwrap();
    let first=TcpListener::bind("127.0.0.1:0").await.unwrap();let addr=first.local_addr().unwrap();
    let origin_task=tauri::async_runtime::spawn(async move{let(mut s,_)=first.accept().await.unwrap();let mut b=[0;4096];let n=s.read(&mut b).await.unwrap();let req=String::from_utf8_lossy(&b[..n]).to_string();let reply=format!("HTTP/1.1 302 Found\r\nLocation: http://{dest}/video\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");s.write_all(reply.as_bytes()).await.unwrap();req});
    let dest_task=tauri::async_runtime::spawn(async move{let(mut s,_)=destination.accept().await.unwrap();let mut b=[0;4096];let n=s.read(&mut b).await.unwrap();let req=String::from_utf8_lossy(&b[..n]).to_string();s.write_all(b"HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nContent-Range: bytes 1-3/5\r\nContent-Length: 3\r\nConnection: close\r\n\r\nbcd").await.unwrap();req});
    let mut headers=HeaderMap::new();headers.insert("Authorization",reqwest::header::HeaderValue::from_static("Bearer private-token"));let url=proxy::start(format!("http://{addr}/video"),headers).await.unwrap();let client=Client::new();let response=client.get(&url).header("Range","bytes=1-3").send().await.unwrap();assert_eq!(response.status().as_u16(),206);assert_eq!(response.text().await.unwrap(),"bcd");let before=origin_task.await.unwrap().to_ascii_lowercase();let after=dest_task.await.unwrap().to_ascii_lowercase();assert!(before.contains("authorization: bearer private-token"));assert!(after.contains("range: bytes=1-3"));assert!(!after.contains("private-token"));let wrong=format!("{}/bad",url.rsplit_once('/').unwrap().0);assert_eq!(client.get(wrong).send().await.unwrap().status().as_u16(),404);
})}

#[test]
fn protected_hls_playlists_rewrite_relative_segments_through_the_private_bridge(){tauri::async_runtime::block_on(async{
    let(root,handle)=server(vec![("200 OK","application/vnd.apple.mpegurl","#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nchunk.ts\n"),("200 OK","video/mp2t","segment")]).await;
    let mut headers=HeaderMap::new();headers.insert("Authorization",reqwest::header::HeaderValue::from_static("Basic fixture-only"));let url=proxy::start(format!("{root}live.m3u8"),headers).await.unwrap();
    let client=Client::new();let manifest=client.get(&url).send().await.unwrap().text().await.unwrap();let segment=manifest.lines().find(|line|!line.is_empty()&&!line.starts_with('#')).unwrap();assert!(segment.starts_with("http://127.0.0.1:"));assert!(!manifest.contains(&root));assert_eq!(client.get(segment).send().await.unwrap().text().await.unwrap(),"segment");let requests=handle.await.unwrap();assert!(requests.iter().all(|r|r.to_ascii_lowercase().contains("authorization: basic fixture-only")));assert!(requests[1].starts_with("GET /chunk.ts"));
})}

#[test]
fn configured_indexers_and_private_playlists_use_the_expected_authentication(){tauri::async_runtime::block_on(async{
    let(root,handle)=server(vec![("200 OK","application/xml","<caps><searching/></caps>"),("200 OK","application/xml",r#"<rss><channel><item><title>Indexer Movie</title><link>magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</link></item></channel></rss>"#)]).await;
    let mut c=Connection{base_url:root,token:"indexer-key".into(),..Default::default()};verify("jackett",&mut c).await.unwrap();let items=browse::list("jackett",&c,"","Movie",0).await.unwrap();assert_eq!(items.items.len(),1);assert!(items.items[0].magnet.starts_with("magnet:?"));let requests=handle.await.unwrap();assert!(requests[0].contains("apikey=indexer-key"));assert!(requests[0].contains("t=caps"));assert!(requests[1].contains("q=Movie"));
    let(root,handle)=server(vec![("200 OK","application/json","[]"),("200 OK","application/json",r#"[{"title":"Search result","infoHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","seeders":12,"downloadUrl":"http://private.test/?apikey=must-not-leak"}]"#)]).await;
    let mut c=Connection{base_url:root,token:"prowlarr-key".into(),..Default::default()};verify("prowlarr",&mut c).await.unwrap();let items=browse::list("prowlarr",&c,"","Search",0).await.unwrap();let serialized=serde_json::to_string(&items).unwrap();assert!(!serialized.contains("must-not-leak"));assert_eq!(items.items[0].kind,"torrent");assert!(handle.await.unwrap().iter().all(|r|r.to_ascii_lowercase().contains("x-api-key: prowlarr-key")));
    let(root,handle)=server(vec![("200 OK","application/x-mpegURL","#EXTM3U\n#EXTINF:-1,Channel\nhttps://tv.example/live.m3u8?token=channel-secret\n")]).await;
    let mut c=Connection{base_url:format!("{root}playlist?password=private-playlist-key"),..Default::default()};verify("iptv",&mut c).await.unwrap();assert_eq!(c.account,"1 channels");assert!(!serde_json::to_string(&summary("iptv",&c)).unwrap().contains("private-playlist-key"));assert!(handle.await.unwrap()[0].contains("password=private-playlist-key"));
})}
