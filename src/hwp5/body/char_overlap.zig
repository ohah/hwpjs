const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const Layout = enum { text_only, full };
pub const ShapeId = struct {
    id: u32,
    pub fn read(r: *Reader) !ShapeId {
        return .{ .id = try r.readInt(u32) };
    }
};
pub const ShapeIds = @import("../../binary/record_array.zig").Records(ShapeId, 4);
pub const Attributes = struct { border: u8, inner_size: i8, expansion: u8, shapes: ShapeIds };
pub const Properties = struct {
    text: []const u8,
    attributes: ?Attributes,
    extra: []const u8,
    /// Control ID is already consumed by control_header. Layout is caller-selected;
    /// old text-only records are not malformed full records with invented zeros.
    pub fn parse(bytes: []const u8, layout: Layout) !Properties {
        var r: Reader = .{ .bytes = bytes };
        const text = try string.read(&r);
        const attributes: ?Attributes = if (layout == .full) blk: {
            const border = try r.readInt(u8);
            const size = try r.readInt(i8);
            const expansion = try r.readInt(u8);
            const count: usize = try r.readInt(u8);
            break :blk .{ .border = border, .inner_size = size, .expansion = expansion, .shapes = try ShapeIds.parse(try r.take(count * 4)) };
        } else null;
        return .{ .text = text, .attributes = attributes, .extra = bytes[r.offset..] };
    }
};
