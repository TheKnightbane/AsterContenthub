#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine};
    #[test]
    #[ignore = "Requires a signed release installer from the preceding build"]
    fn signed_installer_verifies_and_tampering_is_rejected() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let config: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("tauri.conf.json")).unwrap()).unwrap();
        let version = config["version"].as_str().unwrap();
        let bundle = root.join("target/release/bundle/nsis");
        let exe = std::fs::read_dir(bundle).unwrap().flatten().map(|entry| entry.path()).find(|path| path.file_name().unwrap().to_string_lossy().contains(&format!("_{version}_x64-setup.exe")) && path.extension().is_some_and(|ext| ext == "exe")).expect("signed installer");
        let key = String::from_utf8(STANDARD.decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap()).unwrap()).unwrap();
        let signature = String::from_utf8(STANDARD.decode(std::fs::read_to_string(format!("{}.sig", exe.display())).unwrap().trim()).unwrap()).unwrap();
        let key = minisign_verify::PublicKey::decode(&key).unwrap();
        let signature = minisign_verify::Signature::decode(&signature).unwrap();
        let mut bytes = std::fs::read(exe).unwrap();
        key.verify(&bytes, &signature, false).expect("installer signature must match the public key shipped in Aster");
        assert!(signature.trusted_comment().split('\t').any(|field| field == format!("version:{version}")), "the signed version must match the announced update");
        let index = bytes.len() / 2; bytes[index] ^= 1;
        assert!(key.verify(&bytes, &signature, false).is_err(), "modified installers must be rejected");
    }
}
