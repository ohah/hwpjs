//! 빈 snapshot에 Map 제어구조를 반복 내장하지 않는다. live backing이 필요할 때만 단독 할당한다.
const std = @import("std");
const Raw = std.AutoHashMapUnmanaged(usize, []u8);
pub const Map = struct {
    storage: ?*Raw = null,
    pub const empty: Map = .{};
    pub fn count(self: *const Map) u32 {
        return if (self.storage) |map| map.count() else 0;
    }
    pub fn get(self: *const Map, key: usize) ?[]u8 {
        return if (self.storage) |map| map.get(key) else null;
    }
    pub fn fetchRemove(self: *Map, key: usize) ?Raw.KV {
        return if (self.storage) |map| map.fetchRemove(key) else null;
    }
    pub fn ensureUnusedCapacity(self: *Map, a: std.mem.Allocator, additional: u32) !void {
        if (self.storage) |map| return map.ensureUnusedCapacity(a, additional);
        if (additional == 0) return;
        const map = try a.create(Raw);
        errdefer a.destroy(map);
        map.* = .empty;
        errdefer map.deinit(a);
        try map.ensureUnusedCapacity(a, additional);
        // Map 객체와 table이 모두 준비된 뒤에만 소유권을 게시한다.
        self.storage = map;
    }
    pub fn putAssumeCapacity(self: *Map, key: usize, value: []u8) void {
        self.storage.?.putAssumeCapacity(key, value);
    }
    pub fn deinit(self: *Map, a: std.mem.Allocator) void {
        if (self.storage) |map| {
            map.deinit(a);
            a.destroy(map);
        }
        self.* = .empty;
    }
};
test "HX r12: 빈 backing map은 할당0이며 기존 get remove count 소유계약 유지" {
    const a = std.testing.allocator;
    var map: Map = .empty;
    defer map.deinit(a);
    try std.testing.expectEqual(@as(u32, 0), map.count());
    try std.testing.expect(map.get(1) == null);
    try std.testing.expect(map.storage == null);
    const bytes = try a.dupe(u8, "x");
    defer a.free(bytes);
    try map.ensureUnusedCapacity(a, 1);
    map.putAssumeCapacity(1, bytes);
    try std.testing.expectEqualSlices(u8, bytes, map.get(1).?);
    const value = map.fetchRemove(1).?;
    try std.testing.expectEqualSlices(u8, bytes, value.value);
    try std.testing.expectEqual(@as(u32, 0), map.count());
}
test "HX r12: lazy map header 및 table allocation OOM은 미게시 정리" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var map: Map = .empty;
            defer map.deinit(a);
            map.ensureUnusedCapacity(a, 1) catch |err| {
                try std.testing.expect(map.storage == null);
                try std.testing.expectEqual(@as(u32, 0), map.count());
                return err;
            };
        }
    }.run, .{});
}
