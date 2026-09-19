const std = @import("std");
const character_range = @import("emf_plus_character_range.zig");
const values = @import("emf_plus_values.zig");

pub const Options = struct {
    max_tab_stops: u32 = 1_000_000,
    max_character_ranges: u32 = 1_000_000,
};

pub const TabStops = struct {
    bytes: []const u8,
    count: u32,

    pub fn at(self: TabStops, index: u32) !f32 {
        if (index >= self.count) return error.IndexOutOfBounds;
        return values.floatAt(self.bytes, index);
    }
};

pub const Data = struct {
    bytes: []const u8,
    tab_stops: TabStops,
    character_ranges: character_range.Ranges,
};

pub fn parse(bytes: []const u8, tab_stop_count: i32, range_count: i32, options: Options) !Data {
    if (tab_stop_count < 0) return error.InvalidEmfPlusTabStopCount;
    if (range_count < 0) return error.InvalidEmfPlusCharacterRangeCount;
    const tabs: u32 = @intCast(tab_stop_count);
    const ranges: u32 = @intCast(range_count);
    if (tabs > options.max_tab_stops or ranges > options.max_character_ranges)
        return error.LimitExceeded;
    const tab_bytes = std.math.mul(usize, @as(usize, tabs), 4) catch return error.LimitExceeded;
    const range_bytes = std.math.mul(usize, @as(usize, ranges), 8) catch return error.LimitExceeded;
    const expected = std.math.add(usize, tab_bytes, range_bytes) catch return error.LimitExceeded;
    if (bytes.len < expected) return error.UnexpectedEnd;
    if (bytes.len > expected) return error.InvalidEmfPlusStringFormatTrailingData;
    return .{
        .bytes = bytes,
        .tab_stops = .{ .bytes = bytes[0..tab_bytes], .count = tabs },
        .character_ranges = .{ .bytes = bytes[tab_bytes..], .count = ranges },
    };
}

test "EMF+ StringFormatData separates exact tab and character range arrays" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u32, bytes[0..4], @bitCast(@as(f32, -0.0)), .little);
    std.mem.writeInt(u32, bytes[4..8], @bitCast(@as(f32, 8.5)), .little);
    std.mem.writeInt(i32, bytes[8..12], -3, .little);
    std.mem.writeInt(i32, bytes[12..16], 9, .little);
    const data = try parse(&bytes, 2, 1, .{});
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(try data.tab_stops.at(0))));
    try std.testing.expectEqual(@as(f32, 8.5), try data.tab_stops.at(1));
    try std.testing.expectEqual(@as(i32, -3), (try data.character_ranges.at(0)).first);
    try std.testing.expectError(error.IndexOutOfBounds, data.tab_stops.at(2));
}

test "EMF+ StringFormatData rejects signed counts limits truncation and trailing bytes" {
    const bytes = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfPlusTabStopCount, parse(&bytes, -1, 0, .{}));
    try std.testing.expectError(error.InvalidEmfPlusCharacterRangeCount, parse(&bytes, 0, -1, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, 2, 1, .{ .max_tab_stops = 1 }));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, 2, 1, .{ .max_character_ranges = 0 }));
    _ = try parse(&bytes, 2, 1, .{ .max_tab_stops = 2, .max_character_ranges = 1 });
    try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..15], 2, 1, .{}));
    try std.testing.expectError(error.InvalidEmfPlusStringFormatTrailingData, parse(&bytes, 1, 1, .{}));
}
