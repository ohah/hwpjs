//! Standalone C ABI archive root for the focused real-Hermes integration probe.
//! Reuses canonical native/context -> existing format Session/history, no fork.
comptime {
    _ = @import("native/abi.zig");
}
