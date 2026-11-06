//! Stateless file construction. Callers load the owned bytes as a new candidate.
const a = @import("memory.zig").allocator;
var output: ?[]u8 = null;
export fn new_document_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
}
export fn new_document_create(format: u32) u32 {
    new_document_output_free();
    output = switch (format) {
        1 => @import("../new_document/root.zig").hwp5(a),
        2 => @import("../new_document/root.zig").hwpx(a),
        else => error.InvalidDocumentFormat,
    } catch |err| {
        _ = @import("cfb.zig").fail(err);
        return 0;
    };
    return 1;
}
export fn new_document_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn new_document_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
