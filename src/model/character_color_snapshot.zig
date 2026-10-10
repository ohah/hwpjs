//! Read-only canonical RGB; null preserves absent or unsupported source values.
pub const Row = struct { id: u32, color: ?u32 };
