//! Focused real H5 WASM prefix entrypoint; no Hx editing module or public profile.
comptime {
    _ = @import("wasm/memory.zig");
    _ = @import("wasm/cfb.zig");
    _ = @import("wasm/hwp5_edit.zig");
    _ = @import("wasm/new_document.zig");
}
export fn hwpjs_abi_version() u32 {
    return @import("wasm/abi_schema.zig").version;
}
