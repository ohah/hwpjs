//! Owned character intents; serialized DocInfo is temporary output only.
const std = @import("std");
pub const Entry = @import("../../model/document.zig").CharacterResourceIntent;
/// formatting 요청의 불변 prefix·append 전용 색인이다. 임의 mutable Values에는 사용하지 않는다.
/// 원본 배열 순서와 동일 intent의 첫 ID를 보존한다. Hash에는 패딩 바이트를 사용하지 않는다.
pub const IntentIndex = struct {
    const HashContext = struct {
        pub fn hash(_: @This(), value: Entry) u64 {
            var hasher = std.hash.Wyhash.init(0);
            std.hash.autoHash(&hasher, value.source_id);
            inline for (@import("../../reflection.zig").fields(@import("character_property_payload.zig").Patch)) |field| {
                if (comptime !std.mem.eql(u8, field.name, "border_fill"))
                    std.hash.autoHash(&hasher, @field(value.properties, field.name));
            }
            return hasher.final();
        }
        pub fn eql(_: @This(), left: Entry, right: Entry) bool {
            return std.meta.eql(left, right);
        }
    };
    ids: std.HashMapUnmanaged(Entry, u32, HashContext, std.hash_map.default_max_load_percentage) = .empty,
    original_count: ?usize = null,
    indexed_count: usize = 0,
    declined: bool = false,

    pub fn deinit(self: *IntentIndex, a: std.mem.Allocator) void {
        self.ids.deinit(a);
        self.* = .{};
    }
    fn prepare(self: *IntentIndex, a: std.mem.Allocator, entries: []const Entry, original_count: usize) !bool {
        if (self.declined) return false;
        if ((self.original_count != null and self.original_count.? != original_count) or entries.len < self.indexed_count) {
            self.declined = true;
            return false;
        }
        self.original_count = original_count;
        for (entries[self.indexed_count..], self.indexed_count..) |entry, index| {
            if (entry.properties.border_fill != null) {
                self.declined = true;
                return false;
            }
            const value = std.math.add(usize, original_count, index) catch {
                self.declined = true;
                return false;
            };
            const id = std.math.cast(u32, value) orelse {
                self.declined = true;
                return false;
            };
            const result = try self.ids.getOrPut(a, entry);
            if (!result.found_existing) result.value_ptr.* = id;
            self.indexed_count = index + 1;
        }
        return true;
    }
};

fn validateRequest(original_count: usize, source_id: u32, properties: @import("character_property_payload.zig").Patch) !void {
    try @import("character_property_payload.zig").validate(properties);
    if (original_count >= std.math.maxInt(i32) or source_id >= original_count) return error.InvalidCharacterShapeReference;
}

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
        try validateRequest(original_count, source_id, properties);
        for (self.entries.items, 0..) |entry, index| if (entry.source_id == source_id and std.meta.eql(entry.properties, properties)) {
            const id = std.math.add(usize, original_count, index) catch return error.InvalidCharacterShapeReference;
            return std.math.cast(u32, id) orelse error.InvalidCharacterShapeReference;
        };
        const id = std.math.add(usize, original_count, self.entries.items.len) catch return error.InvalidCharacterShapeReference;
        if (id >= std.math.maxInt(i32)) return error.InvalidCharacterShapeReference;
        try self.entries.append(a, .{ .source_id = source_id, .properties = properties });
        return @intCast(id);
    }
    /// null이면 원래 add 경로로 처리한다. 이 메서드 자체는 모델/History 권한을 발급하지 않는다.
    /// 호출자는 요청 전체에서 entries의 기존 prefix가 바뀌지 않음을 보장해야 한다.
    pub fn addIndexed(self: *Values, a: std.mem.Allocator, index: *IntentIndex, original_count: usize, source_id: u32, properties: @import("character_property_payload.zig").Patch) !?u32 {
        try validateRequest(original_count, source_id, properties);
        if (properties.border_fill != null) return null;
        if (!try index.prepare(a, self.entries.items, original_count)) return null;
        const key: Entry = .{ .source_id = source_id, .properties = properties };
        if (index.ids.get(key)) |id| {
            const at = std.math.cast(usize, id) orelse return error.InvalidCharacterShapeReference;
            if (at < original_count or at - original_count >= self.entries.items.len or
                !std.meta.eql(self.entries.items[at - original_count], key))
            {
                index.declined = true;
                return null;
            }
            return id;
        }
        const next = std.math.add(usize, original_count, self.entries.items.len) catch return error.InvalidCharacterShapeReference;
        if (next >= std.math.maxInt(i32)) return error.InvalidCharacterShapeReference;
        const id: u32 = @intCast(next);
        // 모든 실패 가능한 예약을 끝낸 뒤 두 논리 값을 함께 설치한다.
        try index.ids.ensureUnusedCapacity(a, 1);
        try self.entries.ensureUnusedCapacity(a, 1);
        self.entries.appendAssumeCapacity(key);
        index.ids.putAssumeCapacity(key, id);
        index.indexed_count = self.entries.items.len;
        return id;
    }

    pub fn writeBatch(self: *const Values, a: std.mem.Allocator, original: []const u8, version: @import("../version.zig").Version, original_count: usize, limit: usize) ![]u8 {
        // Unsupported compound border-fill must retain the original writer and its errors.
        for (self.entries.items) |entry| if (entry.properties.border_fill != null) return self.write(a, original, version, original_count, limit);
        return @import("character_property_docinfo.zig").writeBatch(a, original, version, self.entries.items, original_count, limit);
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

fn indexedAllocationCase(a: std.mem.Allocator) !void {
    const original_count: usize = 2;
    const prefix = [_]Entry{
        .{ .source_id = 0, .properties = .{ .size = 1200 } },
        .{ .source_id = 0, .properties = .{ .size = 1200 } },
        .{ .source_id = 1, .properties = .{ .bold = false } },
    };
    var raw: Values = .{};
    defer raw.deinit(a);
    try raw.entries.appendSlice(a, &prefix);
    var indexed = try raw.clone(a);
    defer indexed.deinit(a);
    var index: IntentIndex = .{};
    defer index.deinit(a);
    const requests = [_]Entry{
        .{ .source_id = 0, .properties = .{ .size = 1200 } },
        .{ .source_id = 1, .properties = .{ .bold = false } },
        .{ .source_id = 0, .properties = .{ .font_ids = .{ 0, null, null, null, null, null, null } } },
        .{ .source_id = 0, .properties = .{ .font_ids = .{ null, 0, null, null, null, null, null } } },
        .{ .source_id = 0, .properties = .{ .font_ids = .{ 0, null, null, null, null, null, null } } },
        .{ .source_id = 1, .properties = .{ .font_ids = .{ 0, null, null, null, null, null, null } } },
        .{ .source_id = 0, .properties = .{} },
        .{ .source_id = 0, .properties = .{ .underline_kind = .none } },
    };
    for (requests, 0..) |entry, position| {
        const expected = try raw.add(a, original_count, entry.source_id, entry.properties);
        const before = indexed.entries.items.len;
        const actual = indexed.addIndexed(a, &index, original_count, entry.source_id, entry.properties) catch |err| {
            try std.testing.expectEqual(before, indexed.entries.items.len);
            return err;
        };
        try std.testing.expectEqual(expected, actual.?);
        if (position == 0) try std.testing.expectEqual(@as(u32, 2), actual.?);
        try std.testing.expectEqualDeep(raw.entries.items, indexed.entries.items);
        try std.testing.expectEqual(indexed.entries.items.len, index.indexed_count);
    }
    var copied = try indexed.clone(a);
    defer copied.deinit(a);
    const id = try copied.addIndexed(a, &index, original_count, 0, .{ .size = 1200 });
    try std.testing.expectEqual(@as(?u32, 2), id);
    copied.entries.items[0].properties.size = 1300;
    try std.testing.expect((try copied.addIndexed(a, &index, original_count, 0, .{ .size = 1200 })) == null);
}
test "HWP5 indexed character intents preserve first ID order nullable language fields and allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(indexedAllocationCase, .{});
}
test "HWP5 indexed character intents keep original validation and decline unsupported lifetime" {
    const a = std.testing.allocator;
    var values: Values = .{};
    defer values.deinit(a);
    var index: IntentIndex = .{};
    defer index.deinit(a);
    try std.testing.expectError(error.InvalidCharacterSize, values.addIndexed(a, &index, 0, 0, .{ .size = -1 }));
    try std.testing.expectError(error.InvalidCharacterShapeReference, values.addIndexed(a, &index, 0, 0, .{}));
    try std.testing.expect((try values.addIndexed(a, &index, 1, 0, .{ .border_fill = .{} })) == null);
    _ = try values.addIndexed(a, &index, 1, 0, .{ .bold = true });
    try std.testing.expect((try values.addIndexed(a, &index, 2, 0, .{ .bold = true })) == null);
}
