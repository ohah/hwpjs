//! Optional stateless equation API, independent of either editor session.
const core = @import("../equation/protocol.zig");
const a = @import("memory.zig").allocator;
var output: ?[]u8 = null;
var last_error: []const u8 = "";
export fn equation_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
}
export fn equation_process(ptr: [*]const u8, size: usize) u32 {
    equation_output_free();
    last_error = "";
    if (size > core.max_input_bytes) {
        last_error = "EquationProtocolLimitExceeded";
        return 0;
    }
    output = core.run(a, ptr[0..size]) catch |err| {
        last_error = @errorName(err);
        return 0;
    };
    return 1;
}
export fn equation_output_ptr() ?[*]const u8 {
    return if (output) |bytes| bytes.ptr else null;
}
export fn equation_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn equation_error_ptr() [*]const u8 {
    return last_error.ptr;
}
export fn equation_error_len() usize {
    return last_error.len;
}
