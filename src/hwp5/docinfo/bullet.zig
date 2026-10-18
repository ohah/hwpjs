const std = @import("std");
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
    /// begins it must be complete. An exact 24-byte non-image record may use
    /// the compact four-byte empty picture group followed by a full WCHAR.
    pub fn parse(bytes: []const u8) !Bullet {
        var r: Reader = .{ .bytes = bytes };
        const head = try Head.read(&r);
        const character = try r.readInt(u16);
        const compact_empty = bytes.len == 24 and std.mem.allEqual(u8, bytes[14..22], 0);
        const image: ?Image = if (compact_empty) blk: {
            _ = try r.take(8);
            break :blk .{ .identifier = 0, .contrast = 0, .brightness = 0, .effect = 0, .bin_data_id = 0 };
        } else if (r.offset < bytes.len) try readImage(&r) else null;
        const check = if (r.offset < bytes.len) try r.readInt(u16) else null;
        return .{ .head = head, .character = character, .image = image, .check_character = check, .extra = bytes[r.offset..] };
    }
};

test "bullet compact empty picture retains complete check character without repairing images" {
    const t = std.testing;
    var bytes = @as([24]u8, @splat(0));
    std.mem.writeInt(u16, bytes[12..14], 0x25a1, .little);
    std.mem.writeInt(u16, bytes[22..24], 0x2713, .little);
    const value = try Bullet.parse(&bytes);
    try t.expectEqual(@as(u16, 0x25a1), value.character);
    try t.expectEqual(@as(u16, 0x2713), value.check_character.?);
    try t.expectEqual(@as(i32, 0), value.image.?.identifier);
    try t.expectEqual(@as(u16, 0), value.image.?.bin_data_id);
    try t.expectEqual(@as(usize, 0), value.extra.len);
    // Nonempty image identifiers/attributes cannot borrow the compact layout.
    for (14..22) |index| {
        bytes[index] = 1;
        try t.expectError(error.UnexpectedEnd, Bullet.parse(&bytes));
        bytes[index] = 0;
    }
    // The complete full-width form and its unknown tail remain unchanged.
    var full = @as([26]u8, @splat(0));
    std.mem.writeInt(u16, full[23..25], 0x2713, .little);
    full[25] = 0xaa;
    const full_value = try Bullet.parse(&full);
    try t.expectEqual(@as(u16, 0x2713), full_value.check_character.?);
    try t.expectEqualSlices(u8, &.{0xaa}, full_value.extra);
}
