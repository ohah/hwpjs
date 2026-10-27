//! 기존 editor History.initV2가 사용하는 단일 순서 coordinator 후보. 미컴파일이다.
const std = @import("std");
const editor = @import("editor_session.zig");
const cp = @import("editor_checkpoint.zig");
const commands_mod = @import("editor_history.zig");
const legacy = commands_mod;
const resource_receipt = @import("display_resource_generation.zig");
// 기존 CP 대조 결과만 관측한다. 추가 capture/matches 순회를 만들지 않는다.
fn observedMatches(v: *const cp.Checkpoint, session: *editor.Session, limit: usize) !bool {
    const same = cp.matches(v, session, limit) catch |err| {
        resource_receipt.pauseReceipt(session);
        return err;
    };
    resource_receipt.observedOwnedMatch(session, same);
    return same;
}
pub const Adapter = struct {
    pub const Session = editor.Session;
    pub const Snapshot = cp.Checkpoint;
    pub const Command = legacy.Command;
    pub fn dispose(v: *Snapshot) void {
        v.deinit();
    }
    pub fn payloadCost(s: *Session, limit: usize) !usize {
        return cp.size(s, limit);
    }
    pub fn capture(a: std.mem.Allocator, s: *Session, limit: usize) !Snapshot {
        var view = s.*;
        view.allocator = a;
        return cp.capture(&view, limit);
    }
    pub fn cloneForRestore(v: *const Snapshot, s: *Session, limit: usize) !Snapshot {
        return cp.cloneForRestore(v, s, limit);
    }
    pub fn matches(v: *const Snapshot, s: *Session, limit: usize) !bool {
        return observedMatches(v, s, limit);
    }
    pub fn apply(s: *Session, _: *Snapshot, commands: []const Command, limit: usize) !bool {
        return legacy.History.applyCommandsUnchecked(s, commands, limit);
    }
    pub fn exchange(s: *Session, v: *Snapshot) !void {
        try v.exchange(s);
    }
    pub fn rollback(s: *Session, v: *Snapshot) !void {
        v.rollback(s) catch |err| {
            resource_receipt.block(s);
            return err;
        };
        resource_receipt.pauseReceipt(s);
    }
};

const policy = @import("../model/history_policy.zig");
const entries = @import("history_state_entry.zig");
const OwnedCheckpoint = @import("history_checkpoint_owner.zig").CheckpointOwner;
const stacks = @import("history_state_stack.zig");
const text = @import("suffix_text_delta.zig");
const HistoryValue = union(enum) {
    anchor,
    full: cp.Checkpoint,
    delta: text.Delta,
    state,
};
fn dispose(v: *HistoryValue) void {
    switch (v.*) {
        .full => |*value| value.deinit(),

        // delta bytes는 entry의 arena가 고유 소유하며 arena 해제로 일괄 정리한다.
        .anchor, .delta, .state => {},
    }
}
pub const History = struct {
    const Self = @This();
    pub const Counters = struct { delta: usize = 0, bridge: usize = 0, full: usize = 0, capture: usize = 0 };

    pub const E = entries.Entry(HistoryValue, dispose);
    pub const S = stacks.Stack(E);
    owner: *editor.Session,
    allocator: std.mem.Allocator,
    requested: policy.Options,
    stack: *S,
    poisoned: bool = false,
    managed: bool,
    observed_serial: u64,
    source: [*]const u8,
    lane: ?text.Lane = null,
    total_text_bytes: usize,
    counters: Counters = .{},
    pub fn create(a: std.mem.Allocator, session: *editor.Session, options: policy.Options) !*Self {
        const p = try policy.resolve(options);
        const payload = try cp.size(session, p.max_checkpoint_bytes);
        const total = try totalText(session);
        const initial = try E.create(a, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
        errdefer initial.deinit();
        const managed = session.history_delta_managed;
        if (managed) initial.finish(.anchor, payload) else {
            const value = try captureIn(initial.snapshotAllocator(), session, p.max_checkpoint_bytes);
            initial.finish(.{ .full = value }, payload);
        }
        const self = try a.create(Self);
        errdefer a.destroy(self);
        const stack = try S.createWithMetadata(a, p, initial, @sizeOf(Self));
        self.* = .{ .owner = session, .allocator = a, .requested = options, .stack = stack, .managed = managed, .observed_serial = session.mutation_serial, .source = session.source.ptr, .total_text_bytes = total };
        if (managed) self.installWatches();
        return self;
    }
    pub fn deinit(self: *Self) void {
        const a = self.allocator;
        self.stack.deinit();
        // live buffer는 Session.sites의 소유다. history 해제가 text view를 무효화하지 않는다.
        a.destroy(self);
    }
    fn installWatches(self: *Self) void {
        const watch = @import("text_sites.zig").MutationWatch{ .serial = &self.owner.mutation_serial, .active = &self.owner.history_transaction_active };
        for (self.owner.sections) |*section| {
            section.sites.delta_watch = watch;
            if (section.structure_values) |*values| for (values.paragraphs) |*paragraph| {
                paragraph.sites.delta_watch = watch;
            };
        }
    }
    fn totalText(s: *editor.Session) !usize {
        var total: usize = 0;
        for (s.sections) |section| total = std.math.add(usize, total, try section.textBytes(s.options.max_text_bytes -| total)) catch return error.LimitExceeded;
        return total;
    }
    fn captureIn(a: std.mem.Allocator, s: *editor.Session, limit: usize) !cp.Checkpoint {
        var proxy = s.*;
        proxy.allocator = a;
        return cp.capture(&proxy, limit);
    }
    pub fn ownsSession(self: *const Self, s: *const editor.Session) bool {
        return self.owner == s;
    }
    fn bind(self: *Self, s: *editor.Session) !void {
        // 이 이력에 귀속된 owner만 차단한다. 잘못 전달된 foreign Session은 쓰지 않는다.
        if (self.poisoned) {
            resource_receipt.block(self.owner);
            return error.HistoryMutationUncertain;
        }
        if (s.history_transaction_active) return error.MutationInProgress;
        if (s != self.owner or s.source.ptr != self.source) {
            resource_receipt.block(self.owner);
            return error.SourceBindingMismatch;
        }
        if (self.managed and s.mutation_serial != self.observed_serial) {
            resource_receipt.block(self.owner);
            return error.HistoryCurrentMismatch;
        }
        if (s.mutation_serial == std.math.maxInt(u64)) {
            resource_receipt.block(self.owner);
            return error.HistoryRevisionExhausted;
        }
    }
    fn changedSerial(self: *Self) void {
        self.owner.mutation_serial += 1;
        self.observed_serial = self.owner.mutation_serial;
    }
    fn rollback(self: *Self, before: *cp.Checkpoint, failure: anyerror) anyerror {
        resource_receipt.pauseReceipt(self.owner);
        const same = cp.matches(before, self.owner, self.stack.policy.max_checkpoint_bytes) catch false;
        if (same) {
            self.observed_serial = self.owner.mutation_serial;
            self.lane = null;
            return failure;
        }
        before.rollback(self.owner) catch {
            self.poisoned = true;
            resource_receipt.block(self.owner);
            return error.MutationUncertain;
        };
        if (self.managed) self.installWatches();
        self.lane = null;
        // legacy writer가 증가시킨 serial과 별개로 복원도 이전 ticket을 무효화한다.
        if (self.owner.mutation_serial == std.math.maxInt(u64)) {
            self.poisoned = true;
            resource_receipt.block(self.owner);
            return error.MutationUncertain;
        }
        self.changedSerial();
        return failure;
    }
    pub fn applyBatch(self: *Self, s: *editor.Session, commands: []const commands_mod.Command) !bool {
        try self.bind(s);
        s.history_transaction_active = true;
        defer s.history_transaction_active = false;
        try self.stack.prepare();
        if (!self.managed) return self.snapshotApply(commands);
        if (commands.len == 1 and commands[0].kind == .plain and commands[0].break_before == null) {
            if (try self.deltaApply(commands[0])) |result| return result;
        }
        return self.bridgeApply(commands);
    }
    fn deltaApply(self: *Self, command: commands_mod.Command) !?bool {
        const s = self.owner;
        if (self.lane == null or self.lane.?.section != command.section or self.lane.?.paragraph != command.paragraph) self.lane = try text.locate(s, command.section, command.paragraph);
        const lane = self.lane orelse return null;
        const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
        if (end != lane.units) return null; // 중간 편집은 명시 snapshot fallback이다.
        const next = try E.create(self.allocator, self.stack.policy.max_retained_bytes, self.stack.policy.max_checkpoint_owned_bytes);
        var transferred = false;
        defer if (!transferred) next.deinit();
        const delta = text.prepare(next.allocator(), s, lane, command.deleted, command.inserted) catch |err| return next.captureError(err);
        if (std.mem.eql(u8, delta.removed, delta.inserted)) return false;
        const added = delta.inserted.len;
        const removed = delta.removed.len;
        const total = std.math.add(usize, self.total_text_bytes - removed, added) catch return error.LimitExceeded;
        if (total > s.options.max_text_bytes) return error.LimitExceeded;
        const payload = std.math.add(usize, self.stack.current.payload_bytes - removed, added) catch return error.HistoryCheckpointPayloadLimitExceeded;
        next.finish(.{ .delta = delta }, payload);
        const plan = try self.stack.plan(next);
        try text.validate(s, &delta, true);
        try text.reserve(s, &delta, true);
        text.commit(s, &delta, true);
        self.stack.commit(plan) catch |err| {
            text.commit(s, &delta, false); // reserve가 이전 길이도 확보하여 역연산은 무할당이다.
            self.changedSerial();
            return err;
        };
        transferred = true;
        self.total_text_bytes = total;
        self.lane = .{ .section = delta.section, .paragraph = delta.paragraph, .site = delta.site, .element = delta.element, .units = delta.after_units, .bytes = delta.start_byte + added };
        self.changedSerial();
        self.counters.delta += 1;
        return true;
    }
    fn checkpointRemaining(self: *Self, entry: *const E) !usize {
        const cap: usize = if (self.stack.policy.max_checkpoint_owned_bytes) |n| @min(n, self.stack.policy.max_retained_bytes) else self.stack.policy.max_retained_bytes;
        return std.math.sub(usize, cap, entry.ownedBytes()) catch error.HistoryEntryOwnedLimitExceeded;
    }
    fn bridgeApply(self: *Self, commands: []const commands_mod.Command) !bool {
        const s = self.owner;
        const p = self.stack.policy;
        // rollback CP는 Parent allocator 소유이며 retained CP와 live allocation을 교환하지 않는다.
        var parent_before = try cp.capture(s, p.max_checkpoint_bytes);
        defer parent_before.deinit();
        var upgrade: ?*OwnedCheckpoint = null;
        var upgrade_transferred = false;
        defer if (!upgrade_transferred) {
            if (upgrade) |owned| owned.deinit();
        };
        if (self.stack.current.checkpoint == null) {
            upgrade = try OwnedCheckpoint.create(self.allocator, s, try self.checkpointRemaining(self.stack.current), p.max_checkpoint_bytes);
        }
        const next = try E.create(self.allocator, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
        var transferred = false;
        defer if (!transferred) next.deinit();
        try text.normalize(s);
        self.lane = null;
        const changed = commands_mod.History.applyCommandsUnchecked(s, commands, p.max_checkpoint_bytes) catch |err| return self.rollback(&parent_before, err);
        if (!changed) {
            const same = observedMatches(&parent_before, s, p.max_checkpoint_bytes) catch |err| return self.rollback(&parent_before, err);
            if (!same) return self.rollback(&parent_before, error.HistoryNoOpChangedState);
            self.observed_serial = s.mutation_serial;
            return false;
        }
        const payload = cp.size(s, p.max_checkpoint_bytes) catch |err| return self.rollback(&parent_before, err);
        const total = totalText(s) catch |err| return self.rollback(&parent_before, err);
        const after = OwnedCheckpoint.create(self.allocator, s, self.checkpointRemaining(next) catch |err| return self.rollback(&parent_before, err), p.max_checkpoint_bytes) catch |err| return self.rollback(&parent_before, err);
        next.attach(after);
        next.finish(.state, payload);
        // current 승격과 next 추가를 한 plan으로 검증한다. commit 전 current 비용은 불변이다.
        const plan = self.stack.planUpgrade(next, upgrade) catch |err| return self.rollback(&parent_before, err);
        self.stack.commit(plan) catch |err| return self.rollback(&parent_before, err);
        upgrade_transferred = true;
        transferred = true;
        self.changedSerial();
        self.total_text_bytes = total;
        if (self.managed) self.installWatches();
        self.counters.bridge += 1;
        self.counters.capture += if (upgrade != null) @as(usize, 3) else @as(usize, 2);
        return true;
    }
    /// 기존 direct Zig Session은 full matches/restore guard를 유지한다.
    fn snapshotApply(self: *Self, commands: []const commands_mod.Command) !bool {
        const s = self.owner;
        const p = self.stack.policy;
        if (!try observedMatches(&self.stack.current.value.full, s, p.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
        var before = try cp.cloneForRestore(&self.stack.current.value.full, s, p.max_checkpoint_bytes);
        defer before.deinit();
        const changed = commands_mod.History.applyCommandsUnchecked(s, commands, p.max_checkpoint_bytes) catch |err| return self.rollback(&before, err);
        if (!changed) {
            const same = observedMatches(&self.stack.current.value.full, s, p.max_checkpoint_bytes) catch |err| return self.rollback(&before, err);
            if (!same) return self.rollback(&before, error.HistoryNoOpChangedState);
            return false;
        }
        const payload = cp.size(s, p.max_checkpoint_bytes) catch |err| return self.rollback(&before, err);
        const next = E.create(self.allocator, p.max_retained_bytes, p.max_checkpoint_owned_bytes) catch |err| return self.rollback(&before, err);
        var transferred = false;
        defer if (!transferred) next.deinit();
        const value = captureIn(next.snapshotAllocator(), s, p.max_checkpoint_bytes) catch |err| return self.rollback(&before, next.captureError(err));
        next.finish(.{ .full = value }, payload);
        const plan = self.stack.plan(next) catch |err| return self.rollback(&before, err);
        self.stack.commit(plan) catch |err| return self.rollback(&before, err);
        transferred = true;
        self.observed_serial = s.mutation_serial;
        self.counters.full += 1;
        return true;
    }
    const Travel = struct { history: *Self, redo: bool };
    fn restore(target: *const E, context: Travel) !void {
        const self = context.history;
        const edge = if (context.redo) &target.value else &self.stack.current.value;
        switch (edge.*) {
            .delta => |*delta| {
                try text.validate(self.owner, delta, context.redo);
                try text.reserve(self.owner, delta, context.redo);
                text.commit(self.owner, delta, context.redo);
            },
            .state => {
                const owned = target.checkpoint orelse return error.InvalidHistoryTransition;
                var parent = try cp.cloneForRestore(&owned.value, self.owner, self.stack.policy.max_checkpoint_bytes);
                defer parent.deinit();
                try parent.exchange(self.owner);
                if (self.managed) self.installWatches();
            },
            .full => {
                if (!try observedMatches(&self.stack.current.value.full, self.owner, self.stack.policy.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
                var parent = try cp.cloneForRestore(&target.value.full, self.owner, self.stack.policy.max_checkpoint_bytes);
                defer parent.deinit();
                try parent.exchange(self.owner);
            },
            .anchor => return error.InvalidHistoryTransition,
        }
    }
    fn travel(self: *Self, s: *editor.Session, is_redo: bool) !bool {
        try self.bind(s);
        s.history_transaction_active = true;
        defer s.history_transaction_active = false;
        const changed = try self.stack.move(is_redo, Travel{ .history = self, .redo = is_redo }, restore);
        if (changed) {
            self.changedSerial();
            self.lane = null;
            // 아직 bridge와 delta를 나누지 않아 undo 메타데이터 계산에도 전체 순회가 남는다.
            self.total_text_bytes = totalText(s) catch {
                self.poisoned = true;
                resource_receipt.block(self.owner);
                return error.MutationUncertain;
            };
        }
        return changed;
    }
    pub fn undo(self: *Self, s: *editor.Session) !bool {
        return self.travel(s, false);
    }
    pub fn redo(self: *Self, s: *editor.Session) !bool {
        return self.travel(s, true);
    }
};
