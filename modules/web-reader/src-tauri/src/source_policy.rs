use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::redirect::Policy;
use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

const MAX_REDIRECTS: usize = 10;

pub fn validate_url(raw_url: &str) -> Result<(), String> {
    let parsed_url = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {e}"))?;
    validate_parsed_url(&parsed_url)
}

fn validate_parsed_url(parsed_url: &Url) -> Result<(), String> {
    let scheme = parsed_url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Unsupported scheme: {scheme}"));
    }

    match parsed_url.host() {
        Some(Host::Domain(host)) => {
            let host = host.trim_end_matches('.');
            if host.eq_ignore_ascii_case("localhost")
                || host.to_ascii_lowercase().ends_with(".localhost")
            {
                return Err("Localhost is not allowed".to_string());
            }
        }
        Some(Host::Ipv4(ip)) => validate_ip(IpAddr::V4(ip))?,
        Some(Host::Ipv6(ip)) => validate_ip(IpAddr::V6(ip))?,
        None => return Err("No host in URL".to_string()),
    }

    Ok(())
}

pub fn validate_ip(ip: IpAddr) -> Result<(), String> {
    let disallowed = match ip {
        IpAddr::V4(ip) => is_disallowed_ipv4(ip),
        IpAddr::V6(ip) => is_disallowed_ipv6(ip),
    };
    if disallowed {
        Err(format!("Disallowed IP address: {ip}"))
    } else {
        Ok(())
    }
}

fn is_disallowed_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224
}

fn is_disallowed_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_unspecified()
        || ip.is_loopback()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] & 0xffc0) == 0xfec0
        || (segments[0] & 0xff00) == 0xff00
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        || ip.to_ipv4().is_some_and(is_disallowed_ipv4)
}

pub fn redirect_policy(follow_redirects: bool) -> Policy {
    if !follow_redirects {
        return Policy::none();
    }

    Policy::custom(|attempt| {
        if attempt.previous().len() > MAX_REDIRECTS {
            return attempt.error(io::Error::other("too many redirects"));
        }

        match validate_parsed_url(attempt.url()) {
            Ok(()) => attempt.follow(),
            Err(error) => attempt.error(io::Error::new(io::ErrorKind::PermissionDenied, error)),
        }
    })
}

#[derive(Debug, Default)]
pub struct PublicDnsResolver;

impl Resolve for PublicDnsResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        Box::pin(async move {
            let addresses = tokio::net::lookup_host((host.as_str(), 0))
                .await?
                .collect::<Vec<_>>();
            if addresses.is_empty() {
                return Err(
                    io::Error::new(io::ErrorKind::NotFound, "DNS returned no addresses").into(),
                );
            }
            for address in &addresses {
                validate_ip(address.ip())
                    .map_err(|error| io::Error::new(io::ErrorKind::PermissionDenied, error))?;
            }
            Ok(Box::new(addresses.into_iter()) as Addrs)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_ip, validate_url};
    use std::net::IpAddr;

    #[test]
    fn rejects_local_and_private_literal_urls_including_ipv6() {
        for url in [
            "http://localhost/",
            "http://api.localhost/",
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "http://[fc00::1]/",
            "http://[fe80::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::127.0.0.1]/",
            "http://2130706433/",
        ] {
            assert!(validate_url(url).is_err(), "URL should be rejected: {url}");
        }
    }

    #[test]
    fn accepts_public_http_urls_and_addresses() {
        assert!(validate_url("https://example.com/books").is_ok());
        assert!(validate_url("https://1.1.1.1/").is_ok());
        assert!(validate_url("https://[2606:4700:4700::1111]/").is_ok());
    }

    #[test]
    fn rejects_non_public_dns_override_addresses() {
        for address in ["127.0.0.1", "100.64.0.1", "192.168.1.2", "::1", "fd00::1"] {
            let ip = address.parse::<IpAddr>().unwrap();
            assert!(validate_ip(ip).is_err(), "address should be rejected: {ip}");
        }
    }
}
