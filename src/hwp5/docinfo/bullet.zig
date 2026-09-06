const Reader = @import("../../binary/reader.zig").Reader;
pub const Head = @import("paragraph_head.zig").Head;
const Picture = @import("picture_info.zig").Picture;
pub const Image = struct { identifier: i32, contrast: i8, brightness: i8, effect: u8, bin_data_id: u16 };
fn readImage(r: *Reader) !Image {
    const id = try r.readInt(i32);
    const p = try Picture.read(r);
    return .{ .identifier = id, .contrast = p.contrast, .brightness = p.brightness, .effect = p.effect, .bin_data_id = p.bin_data_id };
}
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
        const image: ?Image = if (r.offset < bytes.len) try readImage(&r) else null;
        const check = if (r.offset < bytes.len) try r.readInt(u16) else null;
        return .{ .head = head, .character = character, .image = image, .check_character = check, .extra = bytes[r.offset..] };
    }
};
