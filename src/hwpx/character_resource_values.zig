//! Owned property intents; sparse XML IDs are not array indices.
const std = @import("std");
const Patch = @import("../model/document.zig").CharacterPropertyPatch;
pub const Entry = struct { source_id: u32, id: u32, properties: Patch };
/// Formatting-patch request index. First matching intent and smallest free ID
/// follow the canonical raw allocator; entries remain the model's sole owner.
pub const Index = struct {
    const Key = struct { source_id: u32, properties: Patch };
    keys: std.AutoHashMapUnmanaged(Key, u32) = .empty,
    original: std.AutoHashMapUnmanaged(u32, void) = .empty,
    occupied: std.AutoHashMapUnmanaged(u32, void) = .empty,
    initialized: bool = false,
    invalid_order: bool = false,
    next: u64 = 0,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.keys.deinit(a);
        self.original.deinit(a);
        self.occupied.deinit(a);
        self.* = .{};
    }
    pub fn reset(self: *Index) void {
        self.keys.clearRetainingCapacity();
        self.original.clearRetainingCapacity();
        self.occupied.clearRetainingCapacity();
        self.initialized = false;
        self.invalid_order = false;
        self.next = 0;
    }
    fn prepare(self: *Index, a: std.mem.Allocator, originals: []const u32, entries: []const Entry) !void {
        if (self.initialized) return;
        errdefer self.reset();
        for (originals) |id| {
            try self.original.put(a, id, {});
            const slot = try self.occupied.getOrPut(a, id);
            if (slot.found_existing) self.invalid_order = true;
        }
        for (entries) |entry| {
            const slot = try self.keys.getOrPut(a, .{ .source_id = entry.source_id, .properties = entry.properties });
            if (!slot.found_existing) slot.value_ptr.* = entry.id;
            const occupied = try self.occupied.getOrPut(a, entry.id);
            if (occupied.found_existing) self.invalid_order = true;
        }
        while (self.next <= std.math.maxInt(u32) and self.occupied.contains(@intCast(self.next))) self.next += 1;
        self.initialized = true;
    }
};
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        self.entries.deinit(a);
        self.* = .{};
    }
    // 이력 스냅샷은 실제 항목만 소유한다. 복원 후 append는 일반 성장 규칙을 따른다.
    pub fn cloneExact(self: *const Values, a: std.mem.Allocator) !Values {
        const items = try a.dupe(Entry, self.entries.items);
        return .{ .entries = std.ArrayList(Entry).fromOwnedSlice(items) };
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var output: Values = .{};
        errdefer output.deinit(a);
        try output.entries.appendSlice(a, self.entries.items);
        return output;
    }
    pub fn addIndexed(self: *Values, a: std.mem.Allocator, original: []const u32, source_id: u32, properties: Patch, index: *Index) !u32 {
        try @import("../model/character_properties.zig").validate(properties);
        if (index.initialized) {
            if (!index.original.contains(source_id)) return error.InvalidCharacterShapeReference;
        } else if (std.mem.indexOfScalar(u32, original, source_id) == null) return error.InvalidCharacterShapeReference;
        try index.prepare(a, original, self.entries.items);
        const key: Index.Key = .{ .source_id = source_id, .properties = properties };
        if (index.keys.get(key)) |id| return id;
        if (index.invalid_order) return error.InvalidResourceIdOrder;
        if (index.next > std.math.maxInt(u32)) return error.ResourceIdExhausted;
        const id: u32 = @intCast(index.next);
        try index.keys.ensureUnusedCapacity(a, 1);
        try index.occupied.ensureUnusedCapacity(a, 1);
        try self.entries.append(a, .{ .source_id = source_id, .id = id, .properties = properties });
        index.keys.putAssumeCapacity(key, id);
        index.occupied.putAssumeCapacity(id, {});
        while (index.next <= std.math.maxInt(u32) and index.occupied.contains(@intCast(index.next))) index.next += 1;
        return id;
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
