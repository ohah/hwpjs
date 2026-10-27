//! HWP5 전용 소유 gap. borrowed slice를 외부로 내보내지 않는다.
const std = @import("std");
pub const Counters = struct {
    window_copy_units: u64 = 0,
    source_copy_units: usize = 0,
    growth_copy_units: usize = 0,
    move_units: usize = 0,
    inserted_copy_units: usize = 0,
    materialize_units: usize = 0,
    range_copy_units: usize = 0,
    run_rows_copied: usize = 0,
};
pub const Backing = struct {
    allocator: std.mem.Allocator,
    storage: []u16,
    left: usize,
    right: usize,
    section: usize,
    paragraph: usize,
    source_node: u32,
    parent_node: ?u32,
    serial: u64 = 0,
    counters: Counters = .{},
    pub fn init(a: std.mem.Allocator, bytes: []const u8, section: usize, paragraph: usize, source_node: u32, parent_node: ?u32) !Backing {
        try @import("plain_text_content.zig").validatePlain(bytes);
        // LF 등 retained control은 r5 거래로 남긴다. CR만 gap에 허용한다.
        var i: usize = 0;
        while (i + 2 < bytes.len) : (i += 2) if (std.mem.readInt(u16, bytes[i..][0..2], .little) < 32) return error.HistoryDeltaCoverageIncomplete;
        const n = bytes.len / 2;
        const storage = try a.alloc(u16, n + 64);
        for (0..n) |j| storage[64 + j] = std.mem.readInt(u16, bytes[j * 2 ..][0..2], .little);
        return .{ .allocator = a, .storage = storage, .left = 0, .right = 64, .section = section, .paragraph = paragraph, .source_node = source_node, .parent_node = parent_node, .counters = .{ .source_copy_units = n } };
    }
    pub fn deinit(self: *Backing) void {
        self.allocator.free(self.storage);
        self.* = undefined;
    }
    pub fn len(self: *const Backing) usize {
        return self.left + self.storage.len - self.right;
    }
    pub fn at(self: *const Backing, i: usize) u16 {
        return self.storage[if (i < self.left) i else self.right + i - self.left];
    }
    pub fn boundary(self: *const Backing, i: usize) !void {
        if (i >= self.len()) return error.InvalidTextPosition;
        if (i > 0 and self.at(i - 1) >= 0xd800 and self.at(i - 1) <= 0xdbff and self.at(i) >= 0xdc00 and self.at(i) <= 0xdfff) return error.SplitSurrogatePair;
    }
    pub fn matches(self: *const Backing, start: usize, values: []const u16) bool {
        if (start > self.len() or values.len > self.len() - start) return false;
        for (values, 0..) |v, i| if (self.at(start + i) != v) return false;
        return true;
    }
    pub fn copyRange(self: *Backing, a: std.mem.Allocator, start: usize, end: usize) ![]u16 {
        if (start > end) return error.InvalidTextPosition;
        try self.boundary(start);
        try self.boundary(end);
        const out = try a.alloc(u16, end - start);
        for (out, 0..) |*v, i| v.* = self.at(start + i);
        self.counters.range_copy_units += out.len;
        return out;
    }
    // 새 allocation에 복사한 뒤 교체한다. 실패 시 기존 storage/borrow/logical text 불변.
    // 호출자는 insert와 remove payload를 독립 소유해야 한다(input alias 금지).
    pub fn reserve(self: *Backing, added: usize) !void {
        if (added <= self.right - self.left) return;
        const need = try std.math.add(usize, self.len(), added);
        if (need > 4 * 1024 * 1024) return error.LimitExceeded;
        const capacity = @min(4 * 1024 * 1024, @max(need, try std.math.mul(usize, self.storage.len, 2)));
        const out = try self.allocator.alloc(u16, capacity);
        @memcpy(out[0..self.left], self.storage[0..self.left]);
        const tail = self.storage.len - self.right;
        @memcpy(out[capacity - tail ..], self.storage[self.right..]);
        self.counters.growth_copy_units += self.len();
        self.allocator.free(self.storage);
        self.storage = out;
        self.right = capacity - tail;
    }
    // prepare/reserve 이후 commit과 rollback에서만 사용. 할당·실패 없음.
    pub fn spliceReserved(self: *Backing, start: usize, removed: usize, inserted: []const u16) void {
        std.debug.assert(start + removed < self.len());
        std.debug.assert(inserted.len <= self.right - self.left + removed);
        if (inserted.len == 0 and start + removed == self.left) {
            self.left = start;
            self.serial +%= 1;
            return;
        }
        if (start < self.left) {
            const count = self.left - start;
            std.mem.copyBackwards(u16, self.storage[self.right - count .. self.right], self.storage[start..self.left]);
            self.left -= count;
            self.right -= count;
            self.counters.move_units += count;
        } else if (start > self.left) {
            const count = start - self.left;
            std.mem.copyForwards(u16, self.storage[self.left..start], self.storage[self.right .. self.right + count]);
            self.left += count;
            self.right += count;
            self.counters.move_units += count;
        }
        self.right += removed;
        @memcpy(self.storage[self.left..][0..inserted.len], inserted);
        self.left += inserted.len;
        self.counters.inserted_copy_units += inserted.len;
        self.serial +%= 1;
    }
    pub fn copyWindow(self: *Backing, a: std.mem.Allocator, start: u32, end: u32) ![]u8 {
        if (start > end or end > self.len()) return error.InvalidTextPosition;
        if (end - start > 4096) return error.LimitExceeded;
        // 읽기에서는 CR 뒤 endpoint도 허용한다. 편집 boundary 계약을 바꾸지 않는다.
        if (start < self.len()) try self.boundary(start);
        if (end < self.len()) try self.boundary(end);
        const bytes = try a.alloc(u8, @as(usize, end - start) * 2);
        for (0..end - start) |i| std.mem.writeInt(u16, bytes[i * 2 ..][0..2], self.at(@as(usize, start) + i), .little);
        self.counters.window_copy_units += end - start;
        return bytes;
    }
    pub fn materialize(self: *Backing, a: std.mem.Allocator) ![]u8 {
        const bytes = try a.alloc(u8, self.len() * 2);
        for (0..self.len()) |i| std.mem.writeInt(u16, bytes[i * 2 ..][0..2], self.at(i), .little);
        self.counters.materialize_units += self.len();
        return bytes;
    }
};
