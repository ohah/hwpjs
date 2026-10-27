//! checkpoint는 논리 state entry 한 개가 단독 소유한다. live Session과 교환하지 않는다.
const std = @import("std");
const cp = @import("editor_checkpoint.zig");
const editor = @import("editor_session.zig");
const Meter = @import("../model/history_owned_entry.zig").Meter;
pub const CheckpointOwner = struct {
    backing: std.mem.Allocator,
    meter: Meter,
    value: cp.Checkpoint,
    retained_by: ?*const anyopaque = null,
    pub fn create(a: std.mem.Allocator, s: *editor.Session, owned_limit: usize, payload_limit: usize) !*CheckpointOwner {
        if (owned_limit < @sizeOf(CheckpointOwner)) return error.HistoryEntryOwnedLimitExceeded;
        const self = try a.create(CheckpointOwner);
        errdefer a.destroy(self);
        self.* = .{ .backing = a, .meter = .{ .backing = a, .limit = owned_limit - @sizeOf(CheckpointOwner) }, .value = undefined };
        // 별도 arena reserve 없이 CP가 실제 요청한 bytes를 직접 계량한다.
        var proxy = s.*;
        proxy.allocator = self.meter.allocator();
        self.value = cp.capture(&proxy, payload_limit) catch |err| {
            std.debug.assert(self.meter.live == 0);
            return if (err == error.OutOfMemory and self.meter.last_failure == .limit) error.HistoryEntryOwnedLimitExceeded else err;
        };
        return self;
    }
    pub fn ownedBytes(self: *const CheckpointOwner) usize {
        return @sizeOf(CheckpointOwner) + self.meter.live;
    }
    pub fn deinit(self: *CheckpointOwner) void {
        const a = self.backing;
        self.value.deinit();
        std.debug.assert(self.meter.live == 0);
        a.destroy(self);
    }
};
