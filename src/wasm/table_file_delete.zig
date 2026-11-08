//! 표 파일 변환 ABI. 세션·이력·파일시스템에는 접근하지 않는다.
const allocator = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const owner = @import("table_file_delete_output.zig");
var output: owner.Output = .{ .allocator = allocator };

export fn table_file_delete_free() void {
    output.clear();
}
export fn table_file_delete_ptr() usize {
    return output.ptr();
}
export fn table_file_delete_len() usize {
    return output.len();
}
export fn table_file_delete(format: u32, docptr: [*]const u8, len: usize, section: u32, targets_ptr: [*]const u32, targets_len: usize) u32 {
    output.replace(.{
        .format = format,
        .input_ptr = docptr,
        .input_len = len,
        .section = section,
        .targets_ptr = targets_ptr,
        .targets_len = targets_len,
    }) catch |err| {
        _ = errors.fail(err);
        return 0;
    };
    return 1;
}
