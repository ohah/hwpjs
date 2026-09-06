const Reader = @import("../../binary/reader.zig").Reader;
/// Observed code-4 inline data, not a CTRL_HEADER ID or a field instance ID.
pub const End = struct { middle_raw: u32, memo_index: u32 };
/// Caller selects the data of a code-4 token. Unknown signatures remain opaque.
pub fn parse(data: []const u8) !?End {
    if (data.len < 12) return error.UnexpectedEnd;
    if (data.len != 12) return error.InvalidMemoEndSize;
    var r: Reader = .{ .bytes = data };
    if (try r.readInt(u32) != 0x00256d65) return null;
    return .{ .middle_raw = try r.readInt(u32), .memo_index = try r.readInt(u32) };
}
