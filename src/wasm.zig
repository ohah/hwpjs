//! Browser ABI entrypoint. Each imported file owns one ABI responsibility.
comptime {
    _ = @import("wasm/memory.zig");
    _ = @import("wasm/cfb.zig");
    _ = @import("wasm/cfb_entries.zig");
    _ = @import("wasm/cfb_raw.zig");
    _ = @import("wasm/cfb_search.zig");
    _ = @import("wasm/cfb_writer.zig");
    _ = @import("wasm/hwp5_text.zig");
    _ = @import("wasm/hwpx_text.zig");
    _ = @import("wasm/hwpx_password.zig");
    _ = @import("wasm/hwp5_password.zig");
    _ = @import("wasm/hwpx_edit.zig");
    _ = @import("wasm/hwp5_edit.zig");
    _ = @import("wasm/equation.zig");
    _ = @import("wasm/pcx.zig");
    _ = @import("wasm/new_document.zig");
    _ = @import("wasm/picture_file_replace.zig");
    _ = @import("wasm/table_file_delete.zig");
    _ = @import("wasm/table_file_grid.zig");
    _ = @import("wasm/image_file_insert.zig");
}

export fn hwpjs_abi_version() u32 {
    return @import("wasm/abi_schema.zig").version;
}
