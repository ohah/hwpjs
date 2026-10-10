//! Shared preflight for equal-size nonoverlapping cipher buffers.
pub fn validate(input: []const u8, output: []u8) !void {
    if (input.len != output.len) return error.InvalidOutputLength;
    if (input.len == 0) return;
    const first = @intFromPtr(input.ptr);
    const second = @intFromPtr(output.ptr);
    if (first <= second) {
        if (second - first < input.len) return error.OverlappingBuffers;
    } else if (first - second < output.len) return error.OverlappingBuffers;
}
