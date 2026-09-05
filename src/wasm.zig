//! Browser ABI entrypoint. Each imported file owns one ABI responsibility.
comptime {
    _ = @import("wasm/memory.zig");
    _ = @import("wasm/cfb.zig");
    _ = @import("wasm/cfb_entries.zig");
    _ = @import("wasm/cfb_raw.zig");
}

export fn hwpjs_abi_version() u32 {
    return 1;
}
