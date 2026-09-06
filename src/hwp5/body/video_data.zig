const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const tag: u10 = 98;
/// Table 126 does not define a length-prefix field. Never guess one.
pub const WebLayout = union(enum) { specified_remainder, explicit_units: usize };
pub const Data = union(enum) {
    local: struct { video_id: u16, thumbnail_id: u16 },
    web: struct { tag_utf16: []const u8, thumbnail_id: u16 },
};
pub const Video = struct {
    data: Data,
    extra: []const u8,
    pub fn parse(bytes: []const u8, web_layout: WebLayout) !Video {
        var r: Reader = .{ .bytes = bytes };
        const kind = try r.readInt(i32);
        const data: Data = switch (kind) {
            0 => .{ .local = .{ .video_id = try r.readInt(u16), .thumbnail_id = try r.readInt(u16) } },
            1 => blk: {
                const units = switch (web_layout) {
                    .explicit_units => |n| n,
                    .specified_remainder => n: {
                        const remaining = bytes.len - r.offset;
                        if (remaining < 2) return error.UnexpectedEnd;
                        if ((remaining - 2) % 2 != 0) return error.OddVideoWebTagBytes;
                        break :n (remaining - 2) / 2;
                    },
                };
                break :blk .{ .web = .{ .tag_utf16 = try string.readUnits(&r, units), .thumbnail_id = try r.readInt(u16) } };
            },
            else => return error.UnsupportedVideoType,
        };
        return .{ .data = data, .extra = bytes[r.offset..] };
    }
};
