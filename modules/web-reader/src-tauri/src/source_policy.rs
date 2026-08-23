use url::Url;
use std::net::IpAddr;

pub fn validate_url(raw_url: &str) -> Result<(), String> {
    let parsed_url = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {}", e))?;

    let scheme = parsed_url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Unsupported scheme: {}", scheme));
    }

    if let Some(host) = parsed_url.host_str() {
        if host == "localhost" {
            return Err("Localhost is not allowed".to_string());
        }

        // Try to parse as IP address
        if let Ok(ip) = host.parse::<IpAddr>() {
            match ip {
                IpAddr::V4(ipv4) => {
                    if ipv4.is_loopback() || ipv4.is_private() || ipv4.is_link_local() || ipv4.is_unspecified() || ipv4.is_broadcast() {
                         return Err("Disallowed IP address".to_string());
                    }
                }
                IpAddr::V6(ipv6) => {
                    if ipv6.is_loopback() || ipv6.is_unspecified() {
                         return Err("Disallowed IPv6 address".to_string());
                    }
                }
            }
        }
    } else {
         return Err("No host in URL".to_string());
    }

    Ok(())
}
