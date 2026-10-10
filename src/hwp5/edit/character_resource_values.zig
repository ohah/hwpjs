//! Owned character intents; serialized DocInfo is temporary output only.
const std = @import("std");
pub const Entry = @import("../../model/document.zig").CharacterResourceIntent;
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
    pub fn add(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, properties: @import("character_property_payload.zig").Patch) !u32 {
        try @import("character_property_payload.zig").validate(properties);
        // IDMappings uses signed i32 counts, so reserve room for this entry.
        if (original_count >= std.math.maxInt(i32) or source_id >= original_count) return error.InvalidCharacterShapeReference;
        for (self.entries.items, 0..) |entry, index| if (entry.source_id == source_id and std.meta.eql(entry.properties, properties)) {
            const id = std.math.add(usize, original_count, index) catch return error.InvalidCharacterShapeReference;
            return std.math.cast(u32, id) orelse error.InvalidCharacterShapeReference;
        };
        const id = std.math.add(usize, original_count, self.entries.items.len) catch return error.InvalidCharacterShapeReference;
        if (id >= std.math.maxInt(i32)) return error.InvalidCharacterShapeReference;
        try self.entries.append(a, .{ .source_id = source_id, .properties = properties });
        return @intCast(id);
    }
    pub fn write(self: *const Values, a: std.mem.Allocator, original: []const u8, version: @import("../version.zig").Version, original_count: usize, limit: usize) ![]u8 {
        if (original.len > limit) return error.LimitExceeded;
        if (original_count > std.math.maxInt(i32)) return error.InvalidCharacterShapeReference;
        var bytes = try a.dupe(u8, original);
        errdefer a.free(bytes);
        for (self.entries.items, 0..) |entry, index| {
            if (entry.source_id >= original_count) return error.InvalidCharacterShapeReference;
            const result = try @import("character_property_docinfo.zig").write(a, bytes, version, entry.source_id, entry.properties, limit);
            const expected = std.math.add(usize, original_count, index) catch {
                a.free(result.bytes);
                return error.InvalidCharacterShapeReference;
            };
            if (result.id != expected) {
                a.free(result.bytes);
                return error.ResourceCountMismatch;
            }
            a.free(bytes);
            bytes = result.bytes;
        }
        return bytes;
    }
};

test "HWP5 character resource values preserve ownership reuse and mapping bounds" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: Values = .{};
            defer values.deinit(allocator);
            try std.testing.expectEqual(@as(u32, 2), try values.add(allocator, 2, 0, .{ .bold = true }));
            try std.testing.expectEqual(@as(u32, 2), try values.add(allocator, 2, 0, .{ .bold = true }));
            try std.testing.expectEqual(@as(u32, 3), try values.add(allocator, 2, 0, .{ .bold = false }));
            try std.testing.expectEqual(@as(u32, 4), try values.add(allocator, 2, 0, .{}));
            try std.testing.expectEqual(@as(u32, 5), try values.add(allocator, 2, 0, .{ .underline_kind = .none }));
            try std.testing.expectEqual(@as(u32, 5), try values.add(allocator, 2, 0, .{ .underline_kind = .none }));
            try std.testing.expectEqual(@as(u32, 6), try values.add(allocator, 2, 0, .{ .underline_kind = .top }));
            var copied = try values.clone(allocator);
            defer copied.deinit(allocator);
            copied.entries.items[0].properties.bold = false;
            copied.entries.items[3].properties.underline_kind = .bottom;
            try std.testing.expectEqual(@import("../../model/document.zig").CharacterUnderlineKind.none, values.entries.items[3].properties.underline_kind.?);
            try std.testing.expectEqual(@as(?bool, true), values.entries.items[0].properties.bold);
        }
    }.run, .{});
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expectError(error.InvalidCharacterShapeReference, values.add(a, 0, 0, .{}));
    try std.testing.expectError(error.InvalidCharacterSize, values.add(a, 1, 0, .{ .size = -1 }));
    try std.testing.expectEqual(@as(u32, std.math.maxInt(i32) - 1), try values.add(a, std.math.maxInt(i32) - 1, 0, .{ .bold = true }));
    try std.testing.expectError(error.InvalidCharacterShapeReference, values.add(a, std.math.maxInt(i32) - 1, 0, .{ .bold = false }));
    try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
}

test "HWP5 character resource values materialize multiple intents with allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var input: std.ArrayList(u8) = .empty;
            defer input.deinit(a);
            var map: [60]u8 = @splat(0);
            std.mem.writeInt(i32, map[36..40], 1, .little);
            const append = @import("../record_writer.zig").append;
            try append(a, &input, 17, 0, &map, 4096);
            try append(a, &input, 21, 1, &@as([68]u8, @splat(0)), 4096);
            var values: Values = .{};
            defer values.deinit(a);
            _ = try values.add(a, 1, 0, .{ .size = 1200, .bold = true, .underline_kind = .top });
            _ = try values.add(a, 1, 0, .{ .size = 2400, .italic = true, .underline_kind = .bottom });
            const output = try values.write(a, input.items, .{ .raw = 0x05000000 }, 1, 4096);
            defer a.free(output);
            try std.testing.expectEqual(@as(i32, 3), std.mem.readInt(i32, output[40..44], .little));
            var iterator = @import("../record.zig").Iterator.init(output, .{});
            var index: usize = 0;
            while (try iterator.next()) |record| if (record.tag == 21) {
                const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(record.payload, .{ .raw = 0x05000000 });
                try std.testing.expectEqual(([_]i32{ 0, 1200, 2400 })[index], shape.size);
                try std.testing.expectEqual(([_]u32{ 0, 14, 5 })[index], shape.attributes);
                index += 1;
            };
            try std.testing.expectEqual(@as(usize, 3), index);
            try std.testing.expectEqual(@as(i32, 1), std.mem.readInt(i32, input.items[40..44], .little));
        }
    }.run, .{});
}
