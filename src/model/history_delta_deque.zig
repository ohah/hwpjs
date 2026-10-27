//! 고정 용량 ring: 조회/끝 이동 O(1), 제거 entry만 처리. entry 수명은 호출자가 소유한다.
const std = @import("std");
pub fn Deque(comptime T: type) type {
    return struct {
        const Self = @This();
        pub const Item = struct { value: T, owned_bytes: usize };
        allocator: std.mem.Allocator,
        slots: []Item,
        head: usize = 0,
        len: usize = 0,
        owned_bytes: usize = 0,
        pub fn init(a: std.mem.Allocator, capacity: usize) !Self {
            if (capacity == 0 or capacity > 65535) return error.InvalidHistoryCapacity;
            return .{ .allocator = a, .slots = try a.alloc(Item, capacity) };
        }
        pub fn deinit(self: *Self) void {
            std.debug.assert(self.len == 0); // 모든 entry는 먼저 반환/해제한다.
            self.allocator.free(self.slots);
            self.* = undefined;
        }
        pub fn at(self: *const Self, i: usize) ?Item {
            if (i >= self.len) return null;
            return self.slots[(self.head + i) % self.slots.len];
        }
        pub fn push(self: *Self, item: Item) !void {
            if (self.len == self.slots.len) return error.HistoryDequeFull;
            const total = std.math.add(usize, self.owned_bytes, item.owned_bytes) catch return error.HistoryRetainedLimitExceeded;
            self.slots[(self.head + self.len) % self.slots.len] = item;
            self.len += 1;
            self.owned_bytes = total;
        }
        pub fn popOldest(self: *Self) ?Item {
            if (self.len == 0) return null;
            const item = self.slots[self.head];
            self.head = (self.head + 1) % self.slots.len;
            self.len -= 1;
            self.owned_bytes -= item.owned_bytes;
            return item;
        }
        pub fn popNewest(self: *Self) ?Item {
            if (self.len == 0) return null;
            const item = self.slots[(self.head + self.len - 1) % self.slots.len];
            self.len -= 1;
            self.owned_bytes -= item.owned_bytes;
            return item;
        }
        /// 실제 전체 합산은 명시 검증에서만. 정상 ACK 경로에서는 호출하지 않는다.
        pub fn audit(self: *const Self) bool {
            var total: usize = 0;
            for (0..self.len) |i| total = std.math.add(usize, total, self.at(i).?.owned_bytes) catch return false;
            return total == self.owned_bytes;
        }
    };
}

/// 실제 history entry 포인터만 보관한다. 가중치 복제 없이 entry의 불변 ownedBytes를 합산한다.
pub fn PointerRing(comptime E: type) type {
    return struct {
        const Self = @This();
        allocator: std.mem.Allocator,
        slots: []*E,
        head: usize = 0,
        len: usize = 0,
        owned_bytes: usize = 0,
        pub fn init(a: std.mem.Allocator, capacity: usize) !Self {
            if (capacity == 0 or capacity > 65535) return error.InvalidHistoryCapacity;
            return .{ .allocator = a, .slots = try a.alloc(*E, capacity) };
        }
        pub fn deinit(self: *Self) void {
            std.debug.assert(self.len == 0);
            self.allocator.free(self.slots);
            self.* = undefined;
        }
        pub fn at(self: *const Self, i: usize) ?*E {
            return if (i < self.len) self.slots[(self.head + i) % self.slots.len] else null;
        }
        pub fn push(self: *Self, value: *E) !void {
            if (self.len == self.slots.len) return error.HistoryDequeFull;
            const total = std.math.add(usize, self.owned_bytes, value.ownedBytes()) catch return error.HistoryRetainedLimitExceeded;
            self.slots[(self.head + self.len) % self.slots.len] = value;
            self.len += 1;
            self.owned_bytes = total;
        }
        pub fn popOldest(self: *Self) ?*E {
            if (self.len == 0) return null;
            const value = self.slots[self.head];
            self.head = (self.head + 1) % self.slots.len;
            self.len -= 1;
            self.owned_bytes -= value.ownedBytes();
            return value;
        }
        pub fn popNewest(self: *Self) ?*E {
            if (self.len == 0) return null;
            const value = self.slots[(self.head + self.len - 1) % self.slots.len];
            self.len -= 1;
            self.owned_bytes -= value.ownedBytes();
            return value;
        }
    };
}
