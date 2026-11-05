//! 닫힌 formatting 거래 안의 표시 모양 조회만 소유한다. 원본 검증·최종 저장은 대체하지 않는다.
const std = @import("std");
const Version = @import("../version.zig").Version;
const info = @import("../docinfo/reader.zig");
const display = @import("character_display_shapes.zig");
const Entry = @import("character_resource_values.zig").Entry;
const Cached = struct { intent: Entry, shape: display.Shape };

/// 호출자는 기존 위치에서 첫 canonical Values.writeBatch와 display.read 검증을 끝내야 한다.
/// original_info는 이 context보다 오래 살아야 하며 변경하면 안 된다.
/// entries는 Values.clone/add/toOwnedSlice 경로의 불변 prefix와 append만 허용한다.
/// 임의 배열·다른 문서·rollback 뒤에는 이 context를 재사용하지 않는다.
pub const Context = struct {
    original_info: []const u8,
    version: Version,
    original_count: usize,
    limit: usize,
    originals: std.ArrayList(display.Shape) = .empty,
    payloads: std.ArrayList([]const u8) = .empty,
    generated: std.AutoHashMapUnmanaged(u32, Cached) = .empty,
    loaded: bool = false,
    checked_entries: usize = 0,

    /// 할당·파싱하지 않는다. 최초 resolve도 기존 materialize/read 위치에서만 호출한다.
    pub fn initAfterValidation(original_info: []const u8, version: Version, original_count: usize, limit: usize) Context {
        return .{ .original_info = original_info, .version = version, .original_count = original_count, .limit = limit };
    }
    pub fn deinit(self: *Context, a: std.mem.Allocator) void {
        self.originals.deinit(a);
        self.payloads.deinit(a);
        self.generated.deinit(a);
        self.* = undefined;
    }
    fn loadOriginals(self: *Context, a: std.mem.Allocator) !void {
        if (self.loaded) return;
        if (self.original_info.len > self.limit) return error.LimitExceeded;
        try display.validateReadCount(self.original_count);
        var shapes: std.ArrayList(display.Shape) = .empty;
        defer shapes.deinit(a);
        var payloads: std.ArrayList([]const u8) = .empty;
        defer payloads.deinit(a);
        var iterator = try info.Iterator.init(self.original_info, self.version, .{});
        while (try iterator.next()) |record| {
            if (record.value != .char_shape) continue;
            if (shapes.items.len >= self.original_count) return error.ResourceCountMismatch;
            const id: u32 = @intCast(shapes.items.len);
            try shapes.append(a, display.fromRaw(id, record.value.char_shape));
            try payloads.append(a, record.framing.payload);
        }
        if (shapes.items.len != self.original_count) return error.ResourceCountMismatch;
        self.originals = shapes;
        self.payloads = payloads;
        shapes = .empty;
        payloads = .empty;
        self.loaded = true;
    }
    /// null은 기존 writer/read 경로로 돌아가야 한다는 뜻이다. 권한·적용 성공을 의미하지 않는다.
    /// 새 생성 항목은 canonical payload 검증과 parse가 모두 성공한 뒤에만 memo에 설치한다.
    pub fn resolve(self: *Context, a: std.mem.Allocator, entries: []const Entry, id: u32) !?display.Shape {
        if (entries.len < self.checked_entries) return null;
        for (entries[self.checked_entries..]) |entry| if (entry.properties.border_fill != null) return null;
        const count = std.math.add(usize, self.original_count, entries.len) catch return error.LimitExceeded;
        // The caller checks the current count once at each logical operation's
        // canonical display-read phase. Appends inside that operation are not reads.
        try self.loadOriginals(a);
        if (id >= count) return error.InvalidCharacterShapeReference;
        if (id < self.original_count) {
            self.checked_entries = entries.len;
            return self.originals.items[id];
        }
        const entry = entries[id - self.original_count];
        if (entry.source_id >= self.original_count) return error.InvalidCharacterShapeReference;
        if (self.generated.get(id)) |cached| {
            if (!std.meta.eql(cached.intent, entry)) return null;
            self.checked_entries = entries.len;
            return cached.shape;
        }
        const bytes = try @import("character_property_payload.zig").write(a, self.payloads.items[entry.source_id], self.version, entry.properties, self.limit);
        defer a.free(bytes);
        const raw = try info.CharShape.parse(bytes, self.version);
        const shape = display.fromRaw(id, raw);
        try self.generated.put(a, id, .{ .intent = entry, .shape = shape });
        self.checked_entries = entries.len;
        return shape;
    }
};

fn syntheticInfo(a: std.mem.Allocator) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    errdefer bytes.deinit(a);
    var mappings: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mappings[36..40], 1, .little);
    var payload: [68]u8 = @splat(0);
    std.mem.writeInt(i32, payload[42..46], 1200, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &bytes, 17, 0, &mappings, 4096);
    try append(a, &bytes, 21, 1, &payload, 4096);
    return bytes.toOwnedSlice(a);
}
fn allocationCase(a: std.mem.Allocator) !void {
    const original = try syntheticInfo(a);
    defer a.free(original);
    const version: Version = .{ .raw = 0x05000000 };
    const raw = try display.read(a, original, version, 1);
    defer a.free(raw);
    var context = Context.initAfterValidation(original, version, 1, 4096);
    defer context.deinit(a);
    const base = (try context.resolve(a, &.{}, 0)).?;
    try std.testing.expectEqualDeep(raw[0], base);
    const entries = [_]Entry{.{ .source_id = 0, .properties = .{ .bold = true, .size = 1800 } }};
    const generated = (try context.resolve(a, &entries, 1)).?;
    const values: @import("character_resource_values.zig").Values = .{ .entries = .{ .items = @constCast(&entries), .capacity = entries.len, .pointer_stability = .{} } };
    const current = try values.writeBatch(a, original, version, 1, 4096);
    defer a.free(current);
    const canonical = try display.read(a, current, version, 2);
    defer a.free(canonical);
    try std.testing.expectEqualDeep(canonical[1], generated);
    const replaced_array = try a.dupe(Entry, &entries);
    defer a.free(replaced_array);
    try std.testing.expectEqualDeep(generated, (try context.resolve(a, replaced_array, 1)).?);
    try std.testing.expectEqual(@as(usize, 1), context.generated.count());
    replaced_array[0].properties.italic = true;
    try std.testing.expect((try context.resolve(a, replaced_array, 1)) == null);
    try std.testing.expect((try context.resolve(a, &.{}, 0)) == null);
}
test "HWP5 batch shape context uses canonical payload projection and owns generated values" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "HWP5 batch shape context declines border fill before installing a shape" {
    const a = std.testing.allocator;
    const original = try syntheticInfo(a);
    defer a.free(original);
    var context = Context.initAfterValidation(original, .{ .raw = 0x05000000 }, 1, 4096);
    defer context.deinit(a);
    const entries = [_]Entry{.{ .source_id = 0, .properties = .{ .border_fill = .{} } }};
    try std.testing.expect((try context.resolve(a, &entries, 1)) == null);
    try std.testing.expect(!context.loaded);
    try std.testing.expectEqual(@as(usize, 0), context.generated.count());
}
