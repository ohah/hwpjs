const Reader = @import("../../binary/reader.zig").Reader;
pub const Head = @import("paragraph_head.zig").Head;
pub const Image = struct { identifier: i32, contrast: i8, brightness: i8, effect: u8, bin_data_id: u16 };
pub const Bullet = struct {
    head: Head,
    character: u16,
    image: ?Image,
    check_character: ?u16,
    extra: []const u8,
    /// Observed base/image/check boundaries are 14/23/25 bytes. Once a group
    /// begins it must be complete, including picture info when identifier = 0.
    pub fn parse(bytes: []const u8) !Bullet {
        var r: Reader = .{ .bytes = bytes };
        const head = try Head.read(&r);
        const character = try r.readInt(u16);
        const image: ?Image = if (r.offset < bytes.len) .{ .identifier = try r.readInt(i32), .contrast = try r.readInt(i8), .brightness = try r.readInt(i8), .effect = try r.readInt(u8), .bin_data_id = try r.readInt(u16) } else null;
        const check = if (r.offset < bytes.len) try r.readInt(u16) else null;
        return .{ .head = head, .character = character, .image = image, .check_character = check, .extra = bytes[r.offset..] };
    }
};
