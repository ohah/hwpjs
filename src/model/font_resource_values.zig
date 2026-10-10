//! Owned new font resources; ID allocation and format serialization stay outside.
const std = @import("std");
const faces = @import("font_face_value.zig");
const Language = @import("character_fonts.zig").Language;
pub const Values = struct {
    entries: std.ArrayList(faces.Value) = .empty,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |*entry| entry.deinit(a);
        self.entries.deinit(a);
        self.* = .{};
    }
    pub fn add(self: *Values, a: std.mem.Allocator, language: Language, id: u32, name: []const u8, limit: usize) !bool {
        try @import("font_name.zig").validate(name, limit);
        for (self.entries.items) |entry| if (entry.language == language and entry.id == id) {
            if (entry.name != null and std.mem.eql(u8, entry.name.?, name)) return false;
            return error.DuplicateFontId;
        };
        const owned = try a.dupe(u8, name);
        errdefer a.free(owned);
        try self.entries.append(a, .{ .language = language, .id = id, .name = owned });
        return true;
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var output: Values = .{};
        errdefer output.deinit(a);
        for (self.entries.items) |entry| {
            _ = try output.add(a, entry.language, entry.id, entry.name orelse return error.InvalidFontName, std.math.maxInt(usize));
        }
        return output;
    }
};

test "font resource intents own names scope IDs and rollback every allocation failure" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: Values = .{};
            defer values.deinit(allocator);
            var name = [_]u8{ 'F', 'o', 'n', 't' };
            try std.testing.expect(try values.add(allocator, .hangul, 0, &name, 4));
            name[0] = 'X';
            try std.testing.expectEqualStrings("Font", values.entries.items[0].name.?);
            try std.testing.expect(!try values.add(allocator, .hangul, 0, "Font", 4));
            try std.testing.expect(try values.add(allocator, .latin, 0, "Other", 5));
            try std.testing.expectError(error.DuplicateFontId, values.add(allocator, .hangul, 0, "Other", 5));
            var copied = try values.clone(allocator);
            defer copied.deinit(allocator);
            copied.entries.items[0].name.?[0] = 'Y';
            try std.testing.expectEqualStrings("Font", values.entries.items[0].name.?);
        }
    }.run, .{});
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expectError(error.InvalidFontName, values.add(a, .hangul, 0, "", 4));
    try std.testing.expectError(error.InvalidFontName, values.add(a, .hangul, 0, "\xff", 4));
    try std.testing.expectError(error.LimitExceeded, values.add(a, .hangul, 0, "Font", 3));
    try std.testing.expectEqual(@as(usize, 0), values.entries.items.len);
}
