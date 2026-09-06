const Reader = @import("../../binary/reader.zig").Reader;
pub const EncodedString = struct { code_page: u16, bytes: []const u8 };
pub const Value = union(enum) { i16: i16, i32: i32, filetime: u64, utf16: []const u8, encoded_string: EncodedString, dictionary: []const u8, unsupported: []const u8 };
pub const Parsed = struct { value: Value, extra: []const u8 };
/// HWP's PID 0 is a dictionary, NOT a TypedPropertyValue even if it starts at 1.
pub fn parse(id: u32, raw: []const u8) !Parsed {
    return parseWithCodePage(id, raw, null);
}
pub fn parseWithCodePage(id: u32, raw: []const u8, code_page: ?u16) !Parsed {
    if (id == 0) return .{ .value = .{ .dictionary = raw }, .extra = &.{} };
    var r: Reader = .{ .bytes = raw };
    const tag = try r.readInt(u32);
    const value: Value = switch (tag) {
        2 => blk: {
            const v = try r.readInt(i16);
            if (try r.readInt(u16) != 0) return error.InvalidSummaryPadding;
            break :blk .{ .i16 = v };
        },
        3 => .{ .i32 = try r.readInt(i32) },
        64 => .{ .filetime = try r.readInt(u64) },
        31 => .{ .utf16 = try @import("strings.zig").readUnits(&r, 2, true) },
        30 => if (code_page) |cp| .{ .encoded_string = .{ .code_page = cp, .bytes = try @import("strings.zig").readBytes(&r, cp) } } else {
            // Byte count, padding, and final zero byte are required for BOTH
            // encodings. Missing codepage must not hide known envelope damage.
            _ = try @import("strings.zig").readUnits(&r, 1, true);
            return .{ .value = .{ .unsupported = raw }, .extra = &.{} };
        },
        else => return .{ .value = .{ .unsupported = raw }, .extra = &.{} },
    };
    return .{ .value = value, .extra = raw[r.offset..] };
}
