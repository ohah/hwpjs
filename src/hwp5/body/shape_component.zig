const Reader = @import("../../binary/reader.zig").Reader;
const Rendering = @import("rendering.zig").Rendering;
pub const tag: u10 = 76;
pub const Layout = enum { single_id, double_id };
/// Tables 82-85 only. Type-specific border/fill/shadow data remains in extra.
pub const Component = struct {
    id: u32,
    second_id: ?u32,
    offset_x: i32,
    offset_y: i32,
    group_count: u16,
    local_version: u16,
    original_width: u32,
    original_height: u32,
    current_width: u32,
    current_height: u32,
    attributes: u32,
    rotation_angle: i16,
    rotation_x: i32,
    rotation_y: i32,
    rendering: Rendering,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Component {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .id = try r.readInt(u32),
            .second_id = if (layout == .double_id) try r.readInt(u32) else null,
            .offset_x = try r.readInt(i32),
            .offset_y = try r.readInt(i32),
            .group_count = try r.readInt(u16),
            .local_version = try r.readInt(u16),
            .original_width = try r.readInt(u32),
            .original_height = try r.readInt(u32),
            .current_width = try r.readInt(u32),
            .current_height = try r.readInt(u32),
            .attributes = try r.readInt(u32),
            .rotation_angle = try r.readInt(i16),
            .rotation_x = try r.readInt(i32),
            .rotation_y = try r.readInt(i32),
            .rendering = try Rendering.read(&r),
            .extra = bytes[r.offset..],
        };
    }
    pub fn horizontalFlip(self: Component) bool {
        return self.attributes & 1 != 0;
    }
    pub fn verticalFlip(self: Component) bool {
        return self.attributes & 2 != 0;
    }
};
