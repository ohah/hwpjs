const std = @import("std");
const edit = @import("style_preservation.zig");
pub const Adapter = struct {
    pub const Session = edit.Session;
    pub const Snapshot = *edit.Checkpoint;
    pub const Command = edit.Command;
    pub fn dispose(v: *Snapshot) void {
        v.*.deinit();
    }
    pub fn payloadCost(s: *Session, limit: usize) !usize {
        return s.checkpointSize(limit);
    }
    pub fn capture(a: std.mem.Allocator, s: *Session, limit: usize) !Snapshot {
        return s.createHistoryCheckpointIn(a, limit);
    }
    pub fn cloneForRestore(v: *const Snapshot, s: *Session, limit: usize) !Snapshot {
        return s.cloneHistoryCheckpointForRestore(v.*, limit);
    }
    pub fn matches(v: *const Snapshot, s: *Session, limit: usize) !bool {
        // Existing equality binds allocator+owner; compare a Parent clone, never exchange arena values.
        const parent = try s.cloneHistoryCheckpointForRestore(v.*, limit);
        defer parent.deinit();
        return s.matchesCheckpoint(parent);
    }
    pub fn apply(s: *Session, before: *Snapshot, commands: []const Command, limit: usize) !bool {
        for (commands) |command| try s.apply(command);
        if (try s.matchesCheckpoint(before.*)) return false;
        _ = try s.checkpointSize(limit);
        return true;
    }
    pub fn exchange(s: *Session, v: *Snapshot) !void {
        try s.restoreCheckpoint(v.*);
    }
    pub fn rollback(s: *Session, v: *Snapshot) !void {
        try s.rollbackHistoryCheckpoint(v.*);
    }
};

const policy = @import("../../model/history_policy.zig");
const entries = @import("../../model/history_owned_entry.zig");
const stacks = @import("../../model/history_budget_stack.zig");
const text = @import("history_text_journal.zig");
const epochs = @import("../../model/history_mutation_epoch.zig");
const Value = union(enum) { anchor, full: *edit.Checkpoint, delta: text.Delta, bridge: struct { before: *edit.Checkpoint, after: *edit.Checkpoint } };
fn dispose(v: *Value) void {
    switch (v.*) {
        .anchor => {},
        .full => |cp| cp.deinit(),
        .delta => |*d| d.deinit(),
        .bridge => |b| {
            b.before.deinit();
            b.after.deinit();
        },
    }
}
pub const History = struct {
    const Self = @This();
    pub const E = entries.Entry(Value, dispose);
    pub const S = stacks.Stack(E);
    pub const Counters = struct { delta: usize = 0, bridge: usize = 0, full: usize = 0, capture: usize = 0 };
    owner: *edit.Session,
    allocator: std.mem.Allocator,
    requested: policy.Options,
    stack: *S,
    managed: bool,
    observed: ?epochs.Ticket,
    poisoned: bool = false,
    counters: Counters = .{},
    pub fn create(a: std.mem.Allocator, session: *edit.Session, options: policy.Options) !*Self {
        const p = try policy.resolve(options);
        const managed = session.historyDeltaEnabled();
        const observed = if (managed) try session.historyTicket() else null;
        const payload = try session.checkpointSize(p.max_checkpoint_bytes);
        const initial = try E.create(a, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
        var initial_owned = true;
        errdefer if (initial_owned) initial.deinit();
        if (managed) initial.finish(.anchor, payload) else {
            const cp = session.createHistoryCheckpointIn(initial.allocator(), p.max_checkpoint_bytes) catch |err| return initial.captureError(err);
            initial.finish(.{ .full = cp }, payload);
        }
        const self = try a.create(Self);
        errdefer a.destroy(self);
        const stack = try S.createWithMetadata(a, p, initial, @sizeOf(Self));
        initial_owned = false;
        errdefer stack.deinit();
        self.* = .{ .owner = session, .allocator = a, .requested = options, .stack = stack, .managed = managed, .observed = observed };
        if (managed) try session.registerHistoryPoisonObserver(&self.poisoned);
        return self;
    }
    pub fn deinit(self: *Self) void {
        const a = self.allocator;
        if (self.managed) self.owner.unregisterHistoryPoisonObserver(&self.poisoned);
        self.stack.deinit();
        a.destroy(self);
    }
    fn bind(self: *Self, s: *edit.Session) !void {
        if (self.poisoned) return error.HistoryMutationUncertain;
        if (s != self.owner) return error.SourceBindingMismatch;
        if (self.managed) {
            const current = s.historyTicket() catch |err| {
                if (err == error.HistoryMutationUncertain) self.poisoned = true;
                return err;
            };
            if (!std.meta.eql(current, self.observed.?)) return error.HistoryCurrentMismatch;
        }
    }
    fn begin(self: *Self) !void {
        if (self.managed) try self.owner.beginHistoryTransaction(self.observed.?);
    }
    fn end(self: *Self, wrote: bool) void {
        if (self.managed) {
            self.owner.finishHistoryTransaction(wrote);
            self.observed = self.owner.historyTicket() catch unreachable;
        }
    }
    fn poison(self: *Self) void {
        self.poisoned = true;
        if (self.managed) self.owner.poisonHistoryTransaction();
    }
    fn rollback(self: *Self, before: *edit.Checkpoint, failure: anyerror) anyerror {
        const same = self.owner.matchesCheckpoint(before) catch false;
        if (!same) {
            self.owner.rollbackHistoryCheckpoint(before) catch {
                self.poison();
                return error.MutationUncertain;
            };
            if (comptime @import("builtin").is_test) Probe.noteRestored(self);
        }
        self.end(!same);
        return failure;
    }
    pub fn applyBatch(self: *Self, s: *edit.Session, commands: []const edit.Command) !bool {
        try self.bind(s);
        try self.stack.prepare();
        try self.begin();
        // 각 분기는 성공·실패 모두 같은 Session 거래를 종료한다.
        if (!self.managed) return self.snapshotApply(commands);
        if (commands.len == 1) {
            const result = self.deltaApply(commands[0]) catch |err| {
                if (self.owner.historyTransactionActive()) self.end(false);
                return err;
            };
            if (result) |changed| return changed;
        }
        return self.bridgeApply(commands);
    }
    /// null은 최적화 미대상이며 명령 거부가 아니다. 기존 dispatcher로 넘긴다.
    fn deltaApply(self: *Self, command: edit.Command) !?bool {
        const p = self.stack.policy;
        const next = try E.create(self.allocator, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
        var transferred = false;
        defer if (!transferred) next.deinit();
        var prepared = (self.owner.prepareHistoryTextDelta(next.allocator(), command, p.max_retained_bytes) catch |err| return next.captureError(err)) orelse return null;
        // retained Deltaだけnextに移す。live draftはParent allocatorが独立所有する。
        defer prepared.releaseDraft();
        if (!prepared.changed) {
            prepared.delta.deinit();
            self.end(false);
            return false;
        }
        const less = std.math.sub(usize, self.stack.current.payload_bytes, prepared.before_cost) catch {
            prepared.delta.deinit();
            return error.InvalidCheckpoint;
        };
        const payload = std.math.add(usize, less, prepared.after_cost) catch {
            prepared.delta.deinit();
            return error.HistoryCheckpointPayloadLimitExceeded;
        };
        // 원래 HWP5 checkpointSize(limit)의 거부 분류를 보존한다.
        if (payload > p.max_checkpoint_bytes) {
            prepared.delta.deinit();
            return error.LimitExceeded;
        }
        next.finish(.{ .delta = prepared.delta }, payload);
        const plan = try self.stack.plan(next);
        try self.owner.swapHistoryTextDraft(&prepared);
        self.stack.commit(plan) catch |err| {
            self.owner.swapHistoryTextDraft(&prepared) catch {
                self.poison();
                return error.MutationUncertain;
            };
            self.end(true);
            // 상위 오류 처리에서 이미 종료된 거래를 다시 종료하지 않아야 한다.
            return err;
        };
        transferred = true;
        self.counters.delta += 1;
        self.end(true);
        return true;
    }
    fn bridgeApply(self: *Self, commands: []const edit.Command) !bool {
        const s = self.owner;
        const p = self.stack.policy;
        const parent = s.createCheckpoint(p.max_checkpoint_bytes) catch |err| {
            self.end(false);
            return err;
        };
        defer parent.deinit();
        const next = E.create(self.allocator, p.max_retained_bytes, p.max_checkpoint_owned_bytes) catch |err| {
            self.end(false);
            return err;
        };
        var transferred = false;
        defer if (!transferred) next.deinit();
        const before = s.createHistoryCheckpointIn(next.allocator(), p.max_checkpoint_bytes) catch |err| {
            self.end(false);
            return next.captureError(err);
        };
        var before_transferred = false;
        defer if (!before_transferred) before.deinit();
        self.counters.capture += 2;
        for (commands) |command| s.apply(command) catch |err| return self.rollback(parent, err);
        const same = s.matchesCheckpoint(parent) catch |err| return self.rollback(parent, err);
        if (same) {
            self.end(false);
            return false;
        }
        const payload = s.checkpointSize(p.max_checkpoint_bytes) catch |err| return self.rollback(parent, err);
        const after = s.createHistoryCheckpointIn(next.allocator(), p.max_checkpoint_bytes) catch |err| return self.rollback(parent, next.captureError(err));
        before_transferred = true;
        next.finish(.{ .bridge = .{ .before = before, .after = after } }, payload);
        const plan = self.stack.plan(next) catch |err| return self.rollback(parent, err);
        self.stack.commit(plan) catch |err| return self.rollback(parent, err);
        transferred = true;
        self.counters.capture += 1;
        self.counters.bridge += 1;
        self.end(true);
        return true;
    }
    fn snapshotApply(self: *Self, commands: []const edit.Command) !bool {
        const s = self.owner;
        const p = self.stack.policy;
        if (!try Adapter.matches(&self.stack.current.value.full, s, p.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
        const parent = try s.cloneHistoryCheckpointForRestore(self.stack.current.value.full, p.max_checkpoint_bytes);
        defer parent.deinit();
        for (commands) |command| s.apply(command) catch |err| return self.rollback(parent, err);
        if (s.matchesCheckpoint(parent) catch |err| return self.rollback(parent, err)) return false;
        const payload = s.checkpointSize(p.max_checkpoint_bytes) catch |err| return self.rollback(parent, err);
        const next = E.create(self.allocator, p.max_retained_bytes, p.max_checkpoint_owned_bytes) catch |err| return self.rollback(parent, err);
        var transferred = false;
        defer if (!transferred) next.deinit();
        const cp = s.createHistoryCheckpointIn(next.allocator(), p.max_checkpoint_bytes) catch |err| return self.rollback(parent, next.captureError(err));
        next.finish(.{ .full = cp }, payload);
        const plan = self.stack.plan(next) catch |err| return self.rollback(parent, err);
        self.stack.commit(plan) catch |err| return self.rollback(parent, err);
        transferred = true;
        self.counters.full += 1;
        return true;
    }
    const Travel = struct { history: *Self, redo: bool };
    fn restore(target: *const E, context: Travel) !void {
        const self = context.history;
        const s = self.owner;
        const edge = if (context.redo) &target.value else &self.stack.current.value;
        switch (edge.*) {
            .delta => |*d| try s.restoreHistoryTextDelta(d, context.redo),
            .bridge => |b| {
                const immutable = if (context.redo) b.after else b.before;
                const parent = try s.cloneHistoryCheckpointForRestore(immutable, self.stack.policy.max_checkpoint_bytes);
                defer parent.deinit();
                try s.restoreCheckpoint(parent);
            },
            .full => {
                if (!try Adapter.matches(&self.stack.current.value.full, s, self.stack.policy.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
                const parent = try s.cloneHistoryCheckpointForRestore(target.value.full, self.stack.policy.max_checkpoint_bytes);
                defer parent.deinit();
                try s.restoreCheckpoint(parent);
            },
            .anchor => return error.InvalidHistoryTransition,
        }
    }
    fn travel(self: *Self, s: *edit.Session, is_redo: bool) !bool {
        try self.bind(s);
        try self.begin();
        const changed = self.stack.move(is_redo, Travel{ .history = self, .redo = is_redo }, restore) catch |err| {
            self.end(false);
            return err;
        };
        self.end(changed);
        return changed;
    }
    pub fn undo(self: *Self, s: *edit.Session) !bool {
        return self.travel(s, false);
    }
    pub fn redo(self: *Self, s: *edit.Session) !bool {
        return self.travel(s, true);
    }
};

// 테스트 빌드에서만 private rollback 오류 경로를 그대로 구동한다. 제품 ABI/공통 helper 아님.
pub const Probe = if (@import("builtin").is_test) struct {
    // Test scope only: no allocation, authority mutation, or History/Session fields.
    pub const Witness = struct { owner: *History, restores: usize = 0 };
    threadlocal var active_witness: ?*Witness = null;
    pub fn watch(witness: *Witness) void {
        std.debug.assert(active_witness == null);
        witness.restores = 0;
        active_witness = witness;
    }
    pub fn unwatch(witness: *Witness) usize {
        std.debug.assert(active_witness == witness);
        active_witness = null;
        return witness.restores;
    }
    fn noteRestored(history: *History) void {
        if (active_witness) |witness| {
            if (witness.owner == history) witness.restores += 1;
        }
    }

    pub fn rollback(history: *History, before: *edit.Checkpoint, failure: anyerror) anyerror {
        return history.rollback(before, failure);
    }
} else struct {};
