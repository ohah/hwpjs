const std = @import("std");
const editor = @import("editor_session.zig");
const hv = @import("history_v2.zig");
const Command = @import("editor_history.zig").Command;
// 모든 성공 경로 할당 인덱스를 각각 한 번 실패시킨다. rollback의 다음 할당은 복구된다.
// 지속 OOM/Noori 장기 전수 검증과 구분한다. resize/remap은 항상 fallback으로 보낸다.
const Fault = struct { armed: bool = false, target: ?usize = null, index: usize = 0, failed: bool = false };
const Meter = struct {
    backing: std.mem.Allocator,
    fault: *Fault,
    live: usize = 0,
    fn allocator(self: *Meter) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
    }
    fn alloc(ctx: *anyopaque, len: usize, alignment: std.mem.Alignment, ra: usize) ?[*]u8 {
        const self: *Meter = @ptrCast(@alignCast(ctx));
        if (self.fault.armed) {
            const at = self.fault.index;
            self.fault.index += 1;
            if (self.fault.target == at and !self.fault.failed) {
                self.fault.failed = true;
                return null;
            }
        }
        const bytes = self.backing.rawAlloc(len, alignment, ra) orelse return null;
        self.live += len;
        return bytes;
    }
    fn resize(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) bool {
        return false;
    }
    fn remap(_: *anyopaque, _: []u8, _: std.mem.Alignment, _: usize, _: usize) ?[*]u8 {
        return null;
    }
    fn free(ctx: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, ra: usize) void {
        const self: *Meter = @ptrCast(@alignCast(ctx));
        self.live -= bytes.len;
        self.backing.rawFree(bytes, alignment, ra);
    }
};
const Phase = enum { init, apply, undo, redo };
fn attempt(input: []const u8, phase: Phase, target: ?usize) !usize {
    var fault: Fault = .{};
    var sm: Meter = .{ .backing = std.testing.allocator, .fault = &fault };
    defer std.debug.assert(sm.live == 0);
    var s = try editor.open(sm.allocator(), input, .{});
    defer s.deinit();
    try std.testing.expect(!s.history_delta_managed);
    var hm: Meter = .{ .backing = std.testing.allocator, .fault = &fault };
    defer std.debug.assert(hm.live == 0);
    var h: ?*hv.History = null;
    defer if (h) |value| value.deinit();
    const command: Command = .{ .kind = .anchored, .section = 0, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    if (phase != .init) {
        h = try hv.History.create(hm.allocator(), &s, .{});
        if (phase == .undo or phase == .redo) try std.testing.expect(try h.?.applyBatch(&s, &.{command}));
        if (phase == .redo) try std.testing.expect(try h.?.undo(&s));
        try std.testing.expectEqual(hm.live, h.?.stack.retained_bytes);
    }
    const before = try s.save();
    defer sm.allocator().free(before);
    const before_revision = if (h) |value| value.stack.current.revision else 0;
    const before_retained = if (h) |value| value.stack.retained_bytes else 0;
    fault = .{ .armed = true, .target = target };
    const operation: anyerror!void = operation: {
        switch (phase) {
            .init => h = hv.History.create(hm.allocator(), &s, .{}) catch |err| break :operation err,
            .apply => {
                _ = h.?.applyBatch(&s, &.{command}) catch |err| break :operation err;
            },
            .undo => {
                _ = h.?.undo(&s) catch |err| break :operation err;
            },
            .redo => {
                _ = h.?.redo(&s) catch |err| break :operation err;
            },
        }
        break :operation {};
    };
    fault.armed = false;
    if (target != null) {
        try std.testing.expect(fault.failed);
        try std.testing.expectError(error.OutOfMemory, operation);
        if (h) |value| {
            try std.testing.expect(!value.poisoned);
            try std.testing.expectEqual(before_revision, value.stack.current.revision);
            try std.testing.expectEqual(before_retained, value.stack.retained_bytes);
        } else try std.testing.expectEqual(@as(usize, 0), hm.live);
        const after = try s.save();
        defer sm.allocator().free(after);
        try std.testing.expectEqualSlices(u8, before, after);
    } else try operation;
    if (h) |value| try std.testing.expectEqual(hm.live, value.stack.retained_bytes);
    return fault.index;
}
test "SSOT full allocator real ZIP: init apply undo redo every one-shot allocation failure is atomic and freed" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", std.testing.allocator, .limited(4_000_000));
    defer std.testing.allocator.free(bytes);
    inline for (.{ Phase.init, Phase.apply, Phase.undo, Phase.redo }) |phase| {
        const count = try attempt(bytes, phase, null);
        try std.testing.expect(count > 0 and count <= 6000);
        for (0..count) |index| _ = try attempt(bytes, phase, index);
        std.debug.print("DIRECT_FULL_REAL_OOM phase={s} successfulAllocations={} failedIndices={} successControls=1 mode=one-shot resizeFallback=true\n", .{ @tagName(phase), count, count });
    }
}
