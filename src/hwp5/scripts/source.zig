const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig").read32;
/// Four borrowed UTF-16LE fields, without assumed NUL termination or transcoding.
/// This validates the binary envelope, never JavaScript syntax or execution safety.
pub const Source = struct {
    header: []const u8,
    source: []const u8,
    pre: []const u8,
    post: []const u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Source {
        var r: Reader = .{ .bytes = bytes };
        const header = try string(&r);
        const source = try string(&r);
        const pre = try string(&r);
        const post = try string(&r);
        if (try r.readInt(u32) != 0xffffffff) return error.InvalidScriptEndFlag;
        return .{ .header = header, .source = source, .pre = pre, .post = post, .extra = bytes[r.offset..] };
    }
};
