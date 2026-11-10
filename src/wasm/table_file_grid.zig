//! Optional immutable source-table transform ABI; independent of liveSession.
const allocator = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const owner = @import("table_file_grid_output.zig");
var output: owner.Output = .{ .allocator = allocator };
export fn table_file_grid_free() void {
    output.clear();
}
export fn table_file_grid_ptr() usize {
    return output.ptr();
}
export fn table_file_grid_len() usize {
    return output.len();
}
// allowzero preserves the explicit null check under ReleaseSafe optimization;
// its WASM i32 pointer wire type is unchanged.
export fn table_file_grid_edit(format: u32, docptr: [*]allowzero const u8, len: usize, section: u32, target: u32, expected_rows: u32, expected_columns: u32, action: u32, index: u32, layout: u32) u32 {
    output.replace(.{
        .format = format,
        .input_ptr = docptr,
        .input_len = len,
        .section = section,
        .target = target,
        .expected_rows = expected_rows,
        .expected_columns = expected_columns,
        .action = action,
        .index = index,
        .layout = layout,
    }) catch |err| {
        _ = errors.fail(err);
        return 0;
    };
    return 1;
}
