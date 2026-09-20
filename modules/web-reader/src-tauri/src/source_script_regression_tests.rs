use super::*;
use std::io::Write;
use std::net::TcpListener;
use std::thread;

type HttpParts = Vec<(Duration, Vec<u8>)>;

// 仅测试客户端将公开域名解析到本地服务；生产 URL/DNS 策略保持不变。
fn server(responses: Vec<HttpParts>) -> (String, Client, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let handle = thread::spawn(move || {
        for parts in responses {
            let deadline = Instant::now() + Duration::from_secs(3);
            let (mut stream, _) = loop {
                match listener.accept() {
                    Ok(connection) => break connection,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if Instant::now() >= deadline {
                            return;
                        }
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("{error}"),
                }
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut byte = [0u8];
            while !request.ends_with(b"\r\n\r\n") {
                if stream.read(&mut byte).unwrap_or(0) == 0 {
                    return;
                }
                request.push(byte[0]);
            }
            for (delay, bytes) in parts {
                thread::sleep(delay);
                if stream.write_all(&bytes).is_err() {
                    break;
                }
                let _ = stream.flush();
            }
        }
    });
    let client = Client::builder()
        .no_proxy()
        .resolve("script.test", address)
        .build()
        .unwrap();
    (
        format!("http://script.test:{}/", address.port()),
        client,
        handle,
    )
}

fn execute_with_http(
    code: String,
    client: Client,
    timeout_ms: u64,
) -> Result<SourceScriptResponse, SourceScriptError> {
    execute_script_with_client(
        SourceScriptRequest {
            source_id: "regression".to_string(),
            code,
            bindings: serde_json::json!({}),
            timeout_ms: Some(timeout_ms),
            memory_limit_bytes: None,
            stack_limit_bytes: None,
        },
        Arc::new(Jar::default()),
        Arc::new(Mutex::new(HashMap::new())),
        Arc::new(None),
        client,
    )
}

#[test]
fn caught_host_timeout_cannot_return_success() {
    for slow_body in [false, true] {
        let header = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n".to_vec();
        let parts = if slow_body {
            vec![
                (Duration::ZERO, header),
                (Duration::from_millis(600), b"ok".to_vec()),
            ]
        } else {
            vec![(
                Duration::from_millis(600),
                [header, b"ok".to_vec()].concat(),
            )]
        };
        let (url, client, worker) = server(vec![parts]);
        let code = format!("try {{ java.ajax({url:?}); }} catch (e) {{}}; 'ok'");
        let result = execute_with_http(code, client, 150);
        worker.join().unwrap();
        let error = result.unwrap_err();
        assert_eq!(error.code, "JS_TIMEOUT", "{}", error.message);
    }
}

#[test]
fn consecutive_ajax_calls_share_one_deadline() {
    let response = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".to_vec();
    let parts = vec![(Duration::from_millis(180), response)];
    let (url, client, worker) = server(vec![parts.clone(), parts]);
    let result = execute_with_http(
        format!("java.ajax({url:?}); try {{ java.ajax({url:?}); }} catch(e) {{}}; 'ok'"),
        client,
        300,
    );
    worker.join().unwrap();
    let error = result.unwrap_err();
    assert_eq!(error.code, "JS_TIMEOUT", "{}", error.message);
}

#[test]
fn response_limits_cover_known_unknown_and_chunked_bodies() {
    for (wire, valid) in [
        ("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n1234", true),
        ("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\n12345", false),
        ("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n1234", true),
        ("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n12345", false),
        ("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n4\r\n1234\r\n0\r\n\r\n", true),
        ("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\n12345\r\n0\r\n\r\n", false),
    ] {
        let (url, client, worker) = server(vec![vec![(Duration::ZERO, wire.as_bytes().to_vec())]]);
        let response = client.get(url).send().unwrap();
        let result = read_limited_script_response(response, Instant::now() + Duration::from_secs(2), 4);
        worker.join().unwrap();
        if valid { assert_eq!(result.unwrap(), "1234"); }
        else { assert!(result.unwrap_err().contains("exceeds")); }
    }
}

#[test]
fn limited_response_preserves_charset_decoding() {
    let mut wire = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=GBK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n".to_vec();
    wire.extend([0xc4, 0xe3, 0xba, 0xc3]);
    let (url, client, worker) = server(vec![vec![(Duration::ZERO, wire)]]);
    let text = read_limited_script_response(
        client.get(url).send().unwrap(),
        Instant::now() + Duration::from_secs(2),
        4,
    )
    .unwrap();
    worker.join().unwrap();
    assert_eq!(text, "你好");
}

#[test]
fn hex_validation_rejects_invalid_inputs_and_preserves_valid_values() {
    for value in ["中文", "😀", "0", "xx", "12zz"] {
        assert!(decode_hex_bytes(value).is_err());
    }
    assert_eq!(decode_hex_bytes(" \t\n").unwrap(), Vec::<u8>::new());
    assert_eq!(decode_hex_bytes("aA Ff 00").unwrap(), vec![170, 255, 0]);
}
