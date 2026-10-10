//! Owned property intents; sparse XML IDs are not array indices.
const std = @import("std");
const Patch = @import("../model/document.zig").CharacterPropertyPatch;
pub const Entry = struct { source_id: u32, id: u32, properties: Patch };
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        self.entries.deinit(a);
        self.* = .{};
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var output: Values = .{};
        errdefer output.deinit(a);
        try output.entries.appendSlice(a, self.entries.items);
        return output;
    }
    pub fn add(self: *Values, a: std.mem.Allocator, original: []const u32, source_id: u32, properties: Patch) !u32 {
        try @import("../model/character_properties.zig").validate(properties);
        if (std.mem.indexOfScalar(u32, original, source_id) == null) return error.InvalidCharacterShapeReference;
        var occupied: std.ArrayList(u32) = .empty;
        defer occupied.deinit(a);
        try occupied.appendSlice(a, original);
        for (self.entries.items) |entry| {
            if (entry.source_id == source_id and std.meta.eql(entry.properties, properties)) return entry.id;
            try occupied.append(a, entry.id);
        }
        std.mem.sort(u32, occupied.items, {}, std.sort.asc(u32));
        const id = try @import("resource_id_allocate.zig").next(occupied.items);
        try self.entries.append(a, .{ .source_id = source_id, .id = id, .properties = properties });
        return id;
    }
};

test "HWPX character resource values reuse sparse IDs preserve optional values and allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: Values = .{};
            defer values.deinit(allocator);
            const original = [_]u32{ 0, 9, 300, std.math.maxInt(u32) };
            try std.testing.expectEqual(@as(u32, 1), try values.add(allocator, &original, 9, .{ .size = 1200, .bold = false }));
            try std.testing.expectEqual(@as(u32, 1), try values.add(allocator, &original, 9, .{ .size = 1200, .bold = false }));
            try std.testing.expectEqual(@as(u32, 2), try values.add(allocator, &original, 9, .{ .size = 1200 }));
            try std.testing.expectEqual(@as(u32, 3), try values.add(allocator, &original, 300, .{ .size = 1200, .bold = false }));
            try std.testing.expectEqual(@as(u32, 4), try values.add(allocator, &original, 9, .{ .size = 1200, .underline_kind = .none }));
            try std.testing.expectEqual(@as(u32, 4), try values.add(allocator, &original, 9, .{ .size = 1200, .underline_kind = .none }));
            try std.testing.expectEqual(@as(u32, 5), try values.add(allocator, &original, 9, .{ .size = 1200, .underline_kind = .center }));
            var copied = try values.clone(allocator);
            defer copied.deinit(allocator);
            copied.entries.items[0].properties.size = 2400;
            copied.entries.items[3].properties.underline_kind = .top;
            try std.testing.expectEqual(@import("../model/document.zig").CharacterUnderlineKind.none, values.entries.items[3].properties.underline_kind.?);
            try std.testing.expectEqual(@as(?i32, 1200), values.entries.items[0].properties.size);
            try std.testing.expectError(error.InvalidCharacterSize, values.add(allocator, &original, 9, .{ .size = -1 }));
            try std.testing.expectError(error.InvalidCharacterShapeReference, values.add(allocator, &original, 1, .{}));
            try std.testing.expectEqual(@as(usize, 5), values.entries.items.len);
        }
    }.run, .{});
}
