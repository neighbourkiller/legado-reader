use std::time::{Duration, Instant};

pub const DOCUMENT_ID_JS: &str = "String(performance.timeOrigin) + ':' + window.location.href";
pub const STABILITY_PERIOD: Duration = Duration::from_millis(750);
pub const CONTEXT_LOST: &str = "__LEGADO_CONTEXT_LOST__";
pub const RECORD_MISSING: &str = "__LEGADO_RECORD_MISSING__";

#[derive(Default)]
pub struct NavigationState {
    pub generation: u64,
    pub loading: bool,
    candidate: Option<(String, Instant)>,
}

impl NavigationState {
    pub fn invalidate(&mut self) {
        self.candidate = None;
    }
    pub fn started(&mut self) {
        self.generation += 1;
        self.loading = true;
        self.candidate = None;
    }

    pub fn finished(&mut self) {
        self.loading = false;
        self.candidate = None;
    }

    pub fn observe(&mut self, document_id: &str, complete: bool, now: Instant) -> bool {
        if self.loading || !complete {
            self.invalidate();
            return false;
        }
        match self.candidate.as_ref() {
            Some((previous, since)) if previous == document_id => {
                now.saturating_duration_since(*since) >= STABILITY_PERIOD
            }
            _ => {
                self.candidate = Some((document_id.to_string(), now));
                false
            }
        }
    }
}

/// 结果读取不改变记录；Rust 收到并解析结果后才确认清理。
pub fn fetch_poll_script(
    store: &str,
    request_id: &str,
    pending: &str,
    document_id: &str,
) -> String {
    format!(
        r#"(() => {{
          if (({DOCUMENT_ID_JS}) !== {document_id}) return '{CONTEXT_LOST}';
          const value = window[{store}]?.[{request_id}];
          if (value === undefined) return '{RECORD_MISSING}';
          if (value === {pending}) return {pending};
          return value;
        }})()"#
    )
}

pub fn fetch_ack_script(store: &str, request_id: &str, document_id: &str) -> String {
    format!("if (({DOCUMENT_ID_JS}) === {document_id}) delete window[{store}]?.[{request_id}];")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_must_be_complete_and_stable_after_navigation() {
        let start = Instant::now();
        let mut state = NavigationState::default();
        assert!(!state.observe("first", false, start));
        assert!(!state.observe("first", true, start));
        assert!(state.observe("first", true, start + STABILITY_PERIOD));
        state.started();
        assert!(!state.observe("second", true, start + Duration::from_secs(2)));
        state.finished();
        assert!(!state.observe("second", true, start + Duration::from_secs(2)));
        assert!(state.observe("second", true, start + Duration::from_secs(3)));
    }

    #[test]
    fn changing_document_resets_stability_even_without_load_event() {
        let start = Instant::now();
        let mut state = NavigationState::default();
        state.observe("first", true, start);
        assert!(!state.observe("second", true, start + STABILITY_PERIOD));
    }

    #[test]
    fn polling_is_repeatable_until_ack_and_distinguishes_lost_context() {
        let runtime = rquickjs::Runtime::new().unwrap();
        let context = rquickjs::Context::full(&runtime).unwrap();
        context.with(|ctx| {
            ctx.eval::<(), _>(r#"globalThis.performance = { timeOrigin: 1 };
              globalThis.window = { location: { href: 'https://example.com/' }, results: { r: 'response' } };"#).unwrap();
            let poll = fetch_poll_script("'results'", "'r'", "'pending'", "'1:https://example.com/'");
            assert_eq!(ctx.eval::<String, _>(poll.as_str()).unwrap(), "response");
            // 模拟第一次原生回调迟到；再次读取仍可取回结果。
            assert_eq!(ctx.eval::<String, _>(poll.as_str()).unwrap(), "response");
            ctx.eval::<(), _>(fetch_ack_script("'results'", "'r'", "'1:https://example.com/'")).unwrap();
            assert_eq!(ctx.eval::<String, _>(poll.as_str()).unwrap(), RECORD_MISSING);
            ctx.eval::<(), _>("performance.timeOrigin = 2;").unwrap();
            assert_eq!(ctx.eval::<String, _>(poll.as_str()).unwrap(), CONTEXT_LOST);
        });
    }

    #[test]
    fn late_ack_cannot_delete_a_new_document_record() {
        let runtime = rquickjs::Runtime::new().unwrap();
        let context = rquickjs::Context::full(&runtime).unwrap();
        context.with(|ctx| {
            ctx.eval::<(), _>(r#"globalThis.performance = { timeOrigin: 2 };
              globalThis.window = { location: { href: 'https://example.com/' }, results: { r: 'new response' } };"#).unwrap();
            ctx.eval::<(), _>(fetch_ack_script("'results'", "'r'", "'1:https://example.com/'")).unwrap();
            assert_eq!(ctx.eval::<String, _>("window.results.r").unwrap(), "new response");
        });
    }
}
