const Reader = @import("../../binary/reader.zig").Reader;
pub const Fill = @import("fill.zig").Fill;
pub const Border = @import("border_line.zig").Border;
pub const BorderFill = struct {
    attributes: u16,
    /// Left, right, top, bottom, diagonal: interleaved six-byte entries.
    borders: [5]Border,
    fill: Fill,
    pub fn parse(bytes: []const u8) !BorderFill {
        return parseWithAdditionalPolicy(bytes, .required);
    }

    pub fn parseWithAdditionalPolicy(bytes: []const u8, policy: @import("fill.zig").AdditionalPolicy) !BorderFill {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u16);
        var borders: [5]Border = undefined;
        for (&borders) |*b| b.* = try Border.read(&r);
        return .{ .attributes = attributes, .borders = borders, .fill = try Fill.parseWithAdditionalPolicy(bytes[r.offset..], policy) };
    }
};

test "observed border fill missing extension retains absence but rejects partial headers and extension lengths" {
    const std = @import("std");
    var bytes = @as([52]u8, @splat(0));
    const absent = try BorderFill.parseWithAdditionalPolicy(bytes[0..36], .observed_absent);
    try std.testing.expect(!absent.fill.data.known.additional_present);
    try std.testing.expectError(error.UnexpectedEnd, BorderFill.parse(bytes[0..36]));
    for (0..36) |length| try std.testing.expectError(error.UnexpectedEnd, BorderFill.parseWithAdditionalPolicy(bytes[0..length], .observed_absent));
    for (37..40) |length| try std.testing.expectError(error.UnexpectedEnd, BorderFill.parseWithAdditionalPolicy(bytes[0..length], .observed_absent));
    try std.testing.expect((try BorderFill.parseWithAdditionalPolicy(bytes[0..40], .observed_absent)).fill.data.known.additional_present);
    std.mem.writeInt(u32, bytes[32..36], 1, .little);
    const pattern = try BorderFill.parseWithAdditionalPolicy(bytes[0..48], .observed_absent);
    try std.testing.expect(pattern.fill.data.known.pattern != null);
    try std.testing.expect(!pattern.fill.data.known.additional_present);
    for (36..48) |length| try std.testing.expectError(error.UnexpectedEnd, BorderFill.parseWithAdditionalPolicy(bytes[0..length], .observed_absent));
    for (49..52) |length| try std.testing.expectError(error.UnexpectedEnd, BorderFill.parseWithAdditionalPolicy(bytes[0..length], .observed_absent));
}
