use super::*;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;

type HttpParts = Vec<(Duration, Vec<u8>)>;

fn read_test_request(stream: &mut TcpStream) -> std::io::Result<bool> {
    // Windows accept 会继承监听 socket 的非阻塞模式；请求尚未到达时必须等待，
    // 否则 WouldBlock 会使测试服务提前断开，根本没有执行预期的延迟响应。
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut request = Vec::new();
    let mut byte = [0u8];
    while !request.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte)? == 0 {
            return Ok(false);
        }
        request.push(byte[0]);
    }
    Ok(true)
}

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
            if !read_test_request(&mut stream).expect("读取测试 HTTP 请求头失败") {
                return;
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

#[test]
fn test_server_waits_for_request_on_inherited_nonblocking_socket() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let (mut stream, _) = listener.accept().unwrap();
    // 显式模拟 Windows 继承的非阻塞连接，让其他平台也能覆盖同一故障路径。
    stream.set_nonblocking(true).unwrap();
    let (ready_tx, ready_rx) = mpsc::channel();
    let (result_tx, result_rx) = mpsc::channel();
    let worker = thread::spawn(move || {
        ready_tx.send(()).unwrap();
        result_tx.send(read_test_request(&mut stream)).unwrap();
    });
    ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 请求头尚未发送时，服务端必须等待，不能把 WouldBlock 当成 EOF。
    let early_result = result_rx.recv_timeout(Duration::from_millis(100));
    assert!(
        matches!(early_result, Err(mpsc::RecvTimeoutError::Timeout)),
        "服务端在请求到达前结束读取: {early_result:?}"
    );
    client
        .write_all(b"GET / HTTP/1.1\r\nHost: script.test\r\n\r\n")
        .unwrap();
    assert!(result_rx
        .recv_timeout(Duration::from_secs(2))
        .unwrap()
        .unwrap());
    worker.join().unwrap();
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

fn assert_caught_host_timeout(slow_body: bool) {
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
    let code = format!("try {{ java.ajax({url:?}); }} catch (e) {{ java.log(String(e)); }}; 'ok'");
    let started = Instant::now();
    let result = execute_with_http(code, client, 150);
    let elapsed = started.elapsed();
    worker.join().unwrap();
    let error = match result {
            Err(error) => error,
            Ok(response) => panic!(
                "预期总预算超时: slow_body={slow_body}, budget=150ms, elapsed={elapsed:?}, response={response:?}"
            ),
        };
    assert_eq!(error.code, "JS_TIMEOUT", "{}", error.message);
}

#[test]
fn caught_host_header_timeout_cannot_return_success() {
    assert_caught_host_timeout(false);
}

#[test]
fn caught_host_body_timeout_cannot_return_success() {
    assert_caught_host_timeout(true);
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
