---
review_agents: [code-simplicity-reviewer, security-sentinel, performance-oracle, architecture-strategist]
plan_review_agents: [code-simplicity-reviewer, architecture-strategist]
---

# Review Context

Add project-specific review instructions here.
These notes are passed to all review agents during /workflows:review and /workflows:work.

Examples:
- "Rust crates/hwp-core is the core parser — extra scrutiny on spec compliance and memory safety"
- "NAPI-RS and Craby bindings — check cross-platform and FFI boundaries"
- "Snapshot tests (insta) are the source of truth for JSON/HTML output — avoid breaking fixtures"
