//! New resource intents only; serialized header XML is never mutable state.
const std = @import("std");
pub const Entry = struct {
    source_id: u32,
    id: u32,
    alignment: @import("paragraph_resource_clone.zig").Alignment,
    margins: @import("paragraph_margin_patch.zig").Patch = .{},
    spacing: ?@import("paragraph_spacing_patch.zig").Spacing = null,
};
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
    /// Sorted original IDs are validated by the existing header reader.
    pub fn add(self: *Values, a: std.mem.Allocator, original: []const u32, source_id: u32, alignment: @import("paragraph_resource_clone.zig").Alignment) !u32 {
        return self.addWithMargins(a, original, source_id, alignment, .{});
    }
    pub fn addWithMargins(self: *Values, a: std.mem.Allocator, original: []const u32, source_id: u32, alignment: @import("paragraph_resource_clone.zig").Alignment, margins: @import("paragraph_margin_patch.zig").Patch) !u32 {
        return self.addWithProperties(a, original, source_id, alignment, margins, null);
    }
    pub fn addWithProperties(self: *Values, a: std.mem.Allocator, original: []const u32, source_id: u32, alignment: @import("paragraph_resource_clone.zig").Alignment, margins: @import("paragraph_margin_patch.zig").Patch, spacing: ?@import("paragraph_spacing_patch.zig").Spacing) !u32 {
        if (spacing) |value| try @import("paragraph_spacing_patch.zig").validate(value);
        try @import("paragraph_style_resources.zig").requireExisting(original, source_id);
        var occupied: std.ArrayList(u32) = .empty;
        defer occupied.deinit(a);
        try occupied.appendSlice(a, original);
        for (self.entries.items) |entry| {
            // Reuse an identical intent; repeated application must not grow resources.
            if (entry.source_id == source_id and entry.alignment == alignment and std.meta.eql(entry.margins, margins) and std.meta.eql(entry.spacing, spacing)) return entry.id;
            try occupied.append(a, entry.id);
        }
        std.mem.sort(u32, occupied.items, {}, std.sort.asc(u32));
        const id = try @import("resource_id_allocate.zig").next(occupied.items);
        try self.entries.append(a, .{ .source_id = source_id, .id = id, .alignment = alignment, .margins = margins, .spacing = spacing });
        return id;
    }
};

test "HWPX paragraph resource values reuse intents own clones and survive all allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: Values = .{};
            defer values.deinit(allocator);
            const id = try values.add(allocator, &.{ 0, 9, 300 }, 9, .RIGHT);
            try std.testing.expectEqual(@as(u32, 1), id);
            try std.testing.expectEqual(id, try values.add(allocator, &.{ 0, 9, 300 }, 9, .RIGHT));
            try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
            try std.testing.expectEqual(@as(u32, 2), try values.add(allocator, &.{ 0, 9, 300 }, 9, .CENTER));
            const margin_id = try values.addWithMargins(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720, .before = 0 });
            try std.testing.expectEqual(@as(u32, 3), margin_id);
            try std.testing.expectEqual(margin_id, try values.addWithMargins(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720, .before = 0 }));
            try std.testing.expectEqual(@as(u32, 4), try values.addWithMargins(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720 }));
            const spacing_id = try values.addWithProperties(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720 }, .{ .kind = 3, .value = 720 });
            try std.testing.expectEqual(@as(u32, 5), spacing_id);
            try std.testing.expectEqual(spacing_id, try values.addWithProperties(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720 }, .{ .kind = 3, .value = 720 }));
            try std.testing.expectEqual(@as(u32, 6), try values.addWithProperties(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{ .indent = -720 }, .{ .kind = 1, .value = 720 }));
            try std.testing.expectError(error.InvalidParagraphSpacing, values.addWithProperties(allocator, &.{ 0, 9, 300 }, 9, .RIGHT, .{}, .{ .kind = 4, .value = 720 }));
            try std.testing.expectEqual(@as(usize, 6), values.entries.items.len);
            var copied = try values.clone(allocator);
            defer copied.deinit(allocator);
            try std.testing.expectEqualDeep(values.entries.items, copied.entries.items);
            copied.entries.items[0].alignment = .LEFT;
            copied.entries.items[2].margins.indent = 1000;
            copied.entries.items[4].spacing.?.value = 1440;
            try std.testing.expectEqual(@as(i32, 720), values.entries.items[4].spacing.?.value);
            try std.testing.expectEqual(@as(?i32, -720), values.entries.items[2].margins.indent);
            try std.testing.expectEqual(@import("paragraph_resource_clone.zig").Alignment.RIGHT, values.entries.items[0].alignment);
        }
    }.run, .{});
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expectError(error.InvalidParagraphShapeReference, values.add(a, &.{ 0, 9 }, 300, .RIGHT));
    try std.testing.expectEqual(@as(usize, 0), values.entries.items.len);
}
