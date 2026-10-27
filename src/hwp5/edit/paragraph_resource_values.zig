//! Owned resource intents, independent of serialized DocInfo bytes.
const std = @import("std");
pub const Entry = @import("../../model/document.zig").ParagraphResourceIntent;
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
    pub fn add(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, alignment: u32) !u16 {
        return self.addWithMargins(a, original_count, source_id, alignment, .{});
    }
    pub fn addWithMargins(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch) !u16 {
        return self.addWithProperties(a, original_count, source_id, alignment, margins, null);
    }
    pub fn addWithProperties(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, spacing: ?@import("paragraph_spacing_payload.zig").Spacing) !u16 {
        return self.addWithFlags(a, original_count, source_id, alignment, margins, spacing, .{});
    }
    pub fn addWithFlags(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, spacing: ?@import("paragraph_spacing_payload.zig").Spacing, flags: @import("../../model/paragraph_flags.zig").Patch) !u16 {
        return self.addWithResources(a, original_count, source_id, alignment, margins, spacing, flags, .{});
    }
    pub fn addWithResources(self: *Values, a: std.mem.Allocator, original_count: usize, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, spacing: ?@import("paragraph_spacing_payload.zig").Spacing, flags: @import("../../model/paragraph_flags.zig").Patch, border_fill: @import("../../model/border_fill_patch.zig").Patch) !u16 {
        if (source_id >= original_count or source_id > std.math.maxInt(u16)) return error.InvalidParagraphShapeReference;
        if (alignment > 5) return error.InvalidParagraphAlignment;
        if (spacing) |value| if (value.kind > 3) return error.InvalidParagraphSpacing;
        for (self.entries.items, 0..) |entry, index| if (entry.source_id == source_id and entry.alignment == alignment and std.meta.eql(entry.margins, margins) and std.meta.eql(entry.spacing, spacing) and std.meta.eql(entry.flags, flags) and std.meta.eql(entry.border_fill, border_fill)) {
            const id = std.math.add(usize, original_count, index) catch return error.InvalidParagraphShapeReference;
            return std.math.cast(u16, id) orelse error.InvalidParagraphShapeReference;
        };
        const id = std.math.add(usize, original_count, self.entries.items.len) catch return error.InvalidParagraphShapeReference;
        const wire = std.math.cast(u16, id) orelse return error.InvalidParagraphShapeReference;
        try self.entries.append(a, .{ .source_id = @intCast(source_id), .alignment = @intCast(alignment), .margins = margins, .spacing = spacing, .flags = flags, .border_fill = border_fill });
        return wire;
    }
    pub fn write(self: *const Values, a: std.mem.Allocator, original: []const u8, version: @import("../version.zig").Version, original_count: usize, limit: usize) ![]u8 {
        if (original.len > limit) return error.LimitExceeded;
        if (original_count > 65536) return error.InvalidParagraphShapeReference;
        var bytes = try a.dupe(u8, original);
        errdefer a.free(bytes);
        for (self.entries.items, 0..) |entry, index| {
            if (entry.source_id >= original_count) return error.InvalidParagraphShapeReference;
            const result = try @import("paragraph_alignment_docinfo.zig").writeWithResource(a, bytes, version, entry.source_id, entry.alignment, entry.margins, entry.spacing, entry.flags, entry.border_fill, limit);
            const expected = std.math.add(usize, original_count, index) catch {
                a.free(result.bytes);
                return error.InvalidParagraphShapeReference;
            };
            if (result.id != expected) {
                a.free(result.bytes);
                return error.ResourceCountMismatch;
            }
            a.free(bytes);
            bytes = result.bytes;
        }
        if (bytes.len > limit) return error.LimitExceeded;
        return bytes;
    }
};

test "HWP5 paragraph resource values reuse own clones and enforce u16 exhaustion" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: Values = .{};
            defer values.deinit(allocator);
            try std.testing.expectEqual(@as(u16, 20), try values.add(allocator, 20, 0, 3));
            try std.testing.expectEqual(@as(u16, 20), try values.add(allocator, 20, 0, 3));
            try std.testing.expectEqual(@as(u16, 21), try values.add(allocator, 20, 0, 2));
            var cloned = try values.clone(allocator);
            defer cloned.deinit(allocator);
            cloned.entries.items[0].alignment = 1;
            try std.testing.expectEqual(@as(u3, 3), values.entries.items[0].alignment);
        }
    }.run, .{});
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expectError(error.InvalidParagraphShapeReference, values.add(a, 0, 0, 3));
    try std.testing.expectError(error.InvalidParagraphAlignment, values.add(a, 1, 0, 6));
    try std.testing.expectEqual(@as(u16, 65535), try values.add(a, 65535, 0, 3));
    try std.testing.expectError(error.InvalidParagraphShapeReference, values.add(a, 65535, 0, 2));
    try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
}

test "HWP5 paragraph resource values materialize multiple intents with allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var original: std.ArrayList(u8) = .empty;
            defer original.deinit(a);
            var map: [60]u8 = @splat(0);
            std.mem.writeInt(i32, map[52..56], 1, .little);
            try @import("../record_writer.zig").append(a, &original, 17, 0, &map, 4096);
            try @import("../record_writer.zig").append(a, &original, 25, 1, &@as([42]u8, @splat(0)), 4096);
            var values: Values = .{};
            defer values.deinit(a);
            _ = try values.add(a, 1, 0, 3);
            _ = try values.addWithProperties(a, 1, 0, 2, .{ .indent = -720 }, .{ .kind = 1, .value = 1000 });
            _ = try values.add(a, 1, 0, 2);
            const bytes = try values.write(a, original.items, .{ .raw = 0x05000000 }, 1, 4096);
            defer a.free(bytes);
            const shapes = try @import("paragraph_display_shapes.zig").read(a, bytes, .{ .raw = 0x05000000 }, 4);
            defer a.free(shapes);
            try std.testing.expectEqual(@as(u3, 0), shapes[0].alignment);
            try std.testing.expectEqual(@as(u3, 3), shapes[1].alignment);
            try std.testing.expectEqual(@as(u3, 2), shapes[2].alignment);
            try std.testing.expectEqual(@as(i32, -720), shapes[2].indent);
            try std.testing.expectEqual(@as(i32, 1000), shapes[2].legacy_spacing);
            try std.testing.expectEqual(@as(u2, 1), shapes[2].legacy_spacing_kind);
            try std.testing.expectEqual(@as(i32, 4), std.mem.readInt(i32, bytes[56..60], .little));
            try std.testing.expectEqual(@as(i32, 1), std.mem.readInt(i32, original.items[56..60], .little));
        }
    }.run, .{});
}
