const Reader = @import("../../binary/reader.zig").Reader;
const Entry = struct {
    id: u32,
    pub fn read(r: *Reader) !Entry {
        return .{ .id = try r.readInt(u32) };
    }
};
pub const Ids = @import("../../binary/record_array.zig").Records(Entry, 4);
pub const Layout = enum { ids_only, with_instance };
/// Table 121 list; observed at the end of a $con Component, not an assumed tag 86.
pub const Info = struct {
    ids: Ids,
    instance_id: ?u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Info {
        var r: Reader = .{ .bytes = bytes };
        const count = try r.readInt(u16);
        if (count > (bytes.len - r.offset) / 4) return error.UnexpectedEnd;
        const ids = try Ids.parse(try r.take(@as(usize, count) * 4));
        const instance = if (layout == .with_instance) try r.readInt(u32) else null;
        return .{ .ids = ids, .instance_id = instance, .extra = bytes[r.offset..] };
    }
};
