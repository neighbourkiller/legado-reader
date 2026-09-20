use super::*;
use std::cell::Cell;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

#[test]
fn cleanup_failure_does_not_reject_migrated_configuration() {
    let db = StorageDb::open_in_memory().unwrap();
    let raw = serde_json::to_string(&WebDavConfig::default()).unwrap();
    let loaded = migrate_legacy_config(&db, &raw, || {
        Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
    })
    .unwrap();
    let persisted = db.get_preference("legado_webdav_config").unwrap().unwrap();
    assert_eq!(
        loaded,
        normalized_config(serde_json::from_str(&persisted).unwrap()).unwrap()
    );
}

#[test]
fn failed_database_write_keeps_legacy_file() {
    let db = StorageDb::open_in_memory().unwrap();
    db.lock()
        .unwrap()
        .execute_batch("PRAGMA query_only = ON;")
        .unwrap();
    let removed = Cell::new(false);
    let raw = serde_json::to_string(&WebDavConfig::default()).unwrap();
    assert!(migrate_legacy_config(&db, &raw, || {
        removed.set(true);
        Ok(())
    })
    .is_err());
    assert!(!removed.get());
}

#[test]
fn invalid_legacy_configuration_is_not_deleted_or_persisted() {
    let db = StorageDb::open_in_memory().unwrap();
    let removed = Cell::new(false);
    for raw in ["not JSON", "{\"serverUrl\":\"file:///bad\"}"] {
        assert!(migrate_legacy_config(&db, raw, || {
            removed.set(true);
            Ok(())
        })
        .is_err());
    }
    assert!(!removed.get());
    assert!(db.get_preference("legado_webdav_config").unwrap().is_none());
}

#[test]
fn successful_migration_persists_before_removing_the_legacy_file() {
    let db = StorageDb::open_in_memory().unwrap();
    let raw = serde_json::to_string(&WebDavConfig::default()).unwrap();
    let removed = Cell::new(false);
    migrate_legacy_config(&db, &raw, || {
        assert!(db.get_preference("legado_webdav_config").unwrap().is_some());
        removed.set(true);
        Ok(())
    })
    .unwrap();
    assert!(removed.get());
}

#[tokio::test]
async fn bounded_backup_reader_handles_missing_length_and_chunked_responses() {
    for (wire, valid) in [
        ("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n1234", true),
        ("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\n12345", false),
        ("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n1234", true),
        ("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n12345", false),
        ("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n4\r\n1234\r\n0\r\n\r\n", true),
        ("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\n12345\r\n0\r\n\r\n", false),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).unwrap();
            let mut byte = [0u8];
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                if stream.read(&mut byte).unwrap_or(0) == 0 { return; }
                request.push(byte[0]);
            }
            let _ = stream.write_all(wire.as_bytes());
        });
        let response = Client::builder().no_proxy().build().unwrap().get(format!("http://{address}/")).send().await.unwrap();
        let result = read_limited_backup(response, 4).await;
        server.join().unwrap();
        if valid { assert_eq!(result.unwrap(), b"1234"); }
        else { assert!(result.unwrap_err().contains("512 MiB")); }
    }
}
