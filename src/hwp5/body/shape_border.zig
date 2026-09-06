const Reader = @import("../../binary/reader.zig").Reader;
pub const Attributes = @import("line_attributes.zig").Attributes;
pub const Layout = enum { spec11, observed13 };
pub const Parsed = struct { value: Border, extra: []const u8 };
pub const Border = struct {
    color: u32,
    width: i32,
    attributes: Attributes,
    outline: u8,
    pub fn read(reader: *Reader, layout: Layout) !Border {
        var r = reader.*;
        const result: Border = .{
            .color = try r.readInt(u32),
            .width = if (layout == .spec11) try r.readInt(i16) else try r.readInt(i32),
            .attributes = .{ .raw = try r.readInt(u32) },
            .outline = try r.readInt(u8),
        };
        reader.* = r;
        return result;
    }
    pub fn parse(bytes: []const u8, layout: Layout) !Parsed {
        var r: Reader = .{ .bytes = bytes };
        const value = try read(&r, layout);
        return .{ .value = value, .extra = bytes[r.offset..] };
    }
};
