const std = @import("std");
const geometry = @import("geometry.zig");
const utf16 = @import("../../text/utf16.zig");

pub const Begin = struct {
    rectangle: geometry.RectL,
    description_characters: u32,
    description: []const u8,
};

pub fn parseBegin(parameters: []const u8) !Begin {
    if (parameters.len < 20) return error.TruncatedEmfPublicBeginGroup;
    const character_count = std.mem.readInt(u32, parameters[16..20], .little);
    const byte_count_u64 = @as(u64, character_count) * 2;
    if (byte_count_u64 > parameters.len - 20) return error.TruncatedEmfPublicGroupDescription;
    if (byte_count_u64 != parameters.len - 20) return error.InvalidEmfPublicGroupDescriptionSize;
    const byte_count: usize = @intCast(byte_count_u64);
    const description = parameters[20 .. 20 + byte_count];
    if (character_count != 0) {
        const stats = utf16.inspect(description, .little) catch return error.InvalidEmfPublicGroupDescriptionUnicode;
        if (!stats.ends_in_nul) return error.UnterminatedEmfPublicGroupDescription;
        if (stats.nul_scalars != 1) return error.InvalidEmfPublicGroupDescriptionTerminator;
    }
    return .{
        .rectangle = try geometry.parseRectL(parameters[0..16]),
        .description_characters = character_count,
        .description = description,
    };
}

pub fn parseEnd(parameters: []const u8) !void {
    if (parameters.len != 0) return error.InvalidEmfPublicEndGroupSize;
}

pub const State = struct {
    depth: usize = 0,
    begin_groups: usize = 0,
    end_groups: usize = 0,
    max_depth: usize = 0,

    pub fn begin(self: *State) !void {
        const next_depth = std.math.add(usize, self.depth, 1) catch return error.LimitExceeded;
        const next_count = std.math.add(usize, self.begin_groups, 1) catch return error.LimitExceeded;
        self.depth = next_depth;
        self.begin_groups = next_count;
        self.max_depth = @max(self.max_depth, next_depth);
    }

    pub fn end(self: *State) !void {
        if (self.depth == 0) return error.UnmatchedEmfPublicEndGroup;
        const next_count = std.math.add(usize, self.end_groups, 1) catch return error.LimitExceeded;
        self.depth -= 1;
        self.end_groups = next_count;
    }

    pub fn finish(self: State) !void {
        if (self.depth != 0) return error.UnclosedEmfPublicGroup;
    }
};

test "begin group preserves rectangle and counted terminated UTF-16 units" {
    var bytes = [_]u8{0} ** 28;
    for ([_]i32{ -4, -3, 2, 1 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[index * 4 ..][0..4], value, .little);
    std.mem.writeInt(u32, bytes[16..20], 4, .little);
    std.mem.writeInt(u16, bytes[20..22], 'A', .little);
    std.mem.writeInt(u16, bytes[22..24], 0xd800, .little);
    std.mem.writeInt(u16, bytes[24..26], 0xdc00, .little);
    const value = try parseBegin(&bytes);
    try std.testing.expectEqual(@as(i32, -4), value.rectangle.left);
    try std.testing.expectEqual(@as(u32, 4), value.description_characters);
    try std.testing.expectEqualSlices(u8, bytes[20..28], value.description);
}

test "group payloads reject every truncation extra unit and missing terminator" {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[16..20], 2, .little);
    std.mem.writeInt(u16, bytes[20..22], 'A', .little);
    std.mem.writeInt(u16, bytes[22..24], 'B', .little);
    for (0..20) |cut| try std.testing.expectError(error.TruncatedEmfPublicBeginGroup, parseBegin(bytes[0..cut]));
    for (20..24) |cut| try std.testing.expectError(error.TruncatedEmfPublicGroupDescription, parseBegin(bytes[0..cut]));
    try std.testing.expectError(error.UnterminatedEmfPublicGroupDescription, parseBegin(&bytes));
    std.mem.writeInt(u16, bytes[22..24], 0, .little);
    try std.testing.expectError(error.TruncatedEmfPublicGroupDescription, parseBegin(bytes[0..23]));
    var extra = [_]u8{0} ** 26;
    extra[0..24].* = bytes;
    try std.testing.expectError(error.InvalidEmfPublicGroupDescriptionSize, parseBegin(&extra));
    var internal_nul = [_]u8{0} ** 24;
    std.mem.writeInt(u32, internal_nul[16..20], 2, .little);
    try std.testing.expectError(error.InvalidEmfPublicGroupDescriptionTerminator, parseBegin(&internal_nul));
    var surrogate = [_]u8{0} ** 24;
    std.mem.writeInt(u32, surrogate[16..20], 2, .little);
    std.mem.writeInt(u16, surrogate[20..22], 0xd800, .little);
    try std.testing.expectError(error.InvalidEmfPublicGroupDescriptionUnicode, parseBegin(&surrogate));
    try parseEnd(&.{});
    try std.testing.expectError(error.InvalidEmfPublicEndGroupSize, parseEnd(&.{0}));
}

test "group state permits nesting and rejects underflow and unfinished groups" {
    var state: State = .{};
    try std.testing.expectError(error.UnmatchedEmfPublicEndGroup, state.end());
    try state.begin();
    try state.begin();
    try std.testing.expectError(error.UnclosedEmfPublicGroup, state.finish());
    try state.end();
    try state.end();
    try state.finish();
    try std.testing.expectEqual(@as(usize, 2), state.begin_groups);
    try std.testing.expectEqual(@as(usize, 2), state.end_groups);
    try std.testing.expectEqual(@as(usize, 2), state.max_depth);

    var overflow_begin: State = .{ .begin_groups = std.math.maxInt(usize) };
    try std.testing.expectError(error.LimitExceeded, overflow_begin.begin());
    try std.testing.expectEqual(@as(usize, 0), overflow_begin.depth);
    var overflow_end: State = .{ .depth = 1, .end_groups = std.math.maxInt(usize) };
    try std.testing.expectError(error.LimitExceeded, overflow_end.end());
    try std.testing.expectEqual(@as(usize, 1), overflow_end.depth);
}
