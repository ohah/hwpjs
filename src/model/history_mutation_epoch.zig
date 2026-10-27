//! 거래 세대는 undo로 되돌리지 않는다. 문서 상태 revision과 별도다.
const std = @import("std");
pub const Binding = struct { document: u64, generation: u64, owner: u64 };
pub const Ticket = struct { binding: Binding, epoch: u64 };
pub const Barrier = struct {
    binding: Binding,
    epoch: u64 = 0,
    active: bool = false,
    poisoned: bool = false,
    closed: bool = false,
    pub fn begin(self: *Barrier, expected: Ticket) !void {
        if (self.closed) return error.SessionClosed;
        if (self.poisoned) return error.HistoryMutationUncertain;
        if (self.active) return error.MutationInProgress;
        if (!std.meta.eql(expected.binding, self.binding)) return error.SourceBindingMismatch;
        if (expected.epoch != self.epoch) return error.StaleMutationEpoch;
        if (self.epoch == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        self.active = true;
    }
    pub fn ticket(self: *const Barrier) Ticket {
        return .{ .binding = self.binding, .epoch = self.epoch };
    }
    /// 성공 변경 및 검증된 rollback 모두 이전 거래 ticket을 무효화한다.
    pub fn finish(self: *Barrier) void {
        std.debug.assert(self.active);
        self.epoch += 1;
        self.active = false;
    }
    /// live를 전혀 쓰지 않은 준비 실패만 동일 epoch를 유지한다.
    pub fn cancelBeforeWrite(self: *Barrier) void {
        std.debug.assert(self.active);
        self.active = false;
    }
    pub fn uncertain(self: *Barrier) void {
        self.poisoned = true;
        self.active = false;
    }
    pub fn close(self: *Barrier) void {
        self.closed = true;
        self.active = false;
    }
};
