const std = @import("std");
pub const Options = struct { max_bytes: usize = 64 * 1024 * 1024 };
/// ICC v2 textType. The returned view includes the terminating NUL.
pub fn parse(data: []const u8, options: Options) ![]const u8 {
    if (data.len > options.max_bytes) return error.LimitExceeded;
    const signature = try @import("type_prefix.zig").inspect(data);
    if (!std.mem.eql(u8, &signature, "text")) return error.InvalidIccTextType;
    const text = data[8..];
    try @import("ascii_terminated.zig").validate(text);
    return text;
}
