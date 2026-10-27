//! HX 전용 state entry. delta arena와 단독 CP allocation을 모두 실제 비용으로 청구한다.
const std = @import("std");
const Meter = @import("../model/history_owned_entry.zig").Meter;
const Owned = @import("history_checkpoint_owner.zig").CheckpointOwner;
pub fn Entry(comptime Value: type, comptime dispose: fn (*Value) void) type {
    return struct {
        const Self = @This();
        pub const CheckpointOwner = Owned;
        checkpoint: ?*Owned = null,
        backing: std.mem.Allocator,
        meter: Meter,
        arena: std.heap.ArenaAllocator,
        value: Value = undefined,
        ready: bool = false,
        payload_bytes: usize = 0,
        revision: u32 = 0,
        retained_by: ?*const anyopaque = null,
        pub fn create(a: std.mem.Allocator, total_limit: usize, explicit_owned_limit: ?u32) !*Self {
            const limit = @min(total_limit, if (explicit_owned_limit) |n| @as(usize, n) else total_limit);
            if (limit < @sizeOf(Self)) return error.HistoryEntryOwnedLimitExceeded;
            const s = try a.create(Self);
            s.* = .{ .backing = a, .meter = .{ .backing = a, .limit = limit - @sizeOf(Self) }, .arena = undefined };
            s.arena = std.heap.ArenaAllocator.init(s.meter.allocator());
            return s;
        }
        pub fn allocator(self: *Self) std.mem.Allocator {
            return self.arena.allocator();
        }
        /// full checkpoint는 자체 deinit으로 각 할당을 해제한다. delta는 기존 arena allocator를 사용한다.
        /// Entry가 안정된 주소에 생성된 뒤에만 사용하며 실제 요청 bytes를 같은 Meter에 청구한다.
        pub fn snapshotAllocator(self: *Self) std.mem.Allocator {
            return self.meter.allocator();
        }
        pub fn finish(self: *Self, value: Value, payload: usize) void {
            std.debug.assert(!self.ready);
            self.value = value;
            self.payload_bytes = payload;
            self.ready = true;
        }
        pub fn ownedBytes(self: *const Self) usize {
            return @sizeOf(Self) + self.meter.live + if (self.checkpoint) |owned| owned.ownedBytes() else @as(usize, 0);
        }
        pub fn attach(self: *Self, owned: *Owned) void {
            std.debug.assert(self.checkpoint == null and owned.retained_by == null);
            owned.retained_by = self;
            self.checkpoint = owned;
        }
        pub fn captureError(self: *const Self, err: anyerror) anyerror {
            return if (err == error.OutOfMemory and self.meter.last_failure == .limit) error.HistoryEntryOwnedLimitExceeded else err;
        }
        pub fn deinit(self: *Self) void {
            const a = self.backing;
            if (self.ready) dispose(&self.value);
            if (self.checkpoint) |owned| owned.deinit();
            self.arena.deinit();
            std.debug.assert(self.meter.live == 0);
            a.destroy(self);
        }
    };
}
