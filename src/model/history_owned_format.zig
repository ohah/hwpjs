//! V2 format-independent transaction; adapters clone mutable values, never files.
const std = @import("std");
const policy_mod = @import("history_policy.zig");
const entries = @import("history_owned_entry.zig");
const stacks = @import("history_budget_stack.zig");
pub fn History(comptime A: type) type {
    return struct {
        const Self = @This();
        pub const E = entries.Entry(A.Snapshot, A.dispose);
        pub const S = stacks.Stack(E);
        owner: *A.Session,
        allocator: std.mem.Allocator,
        requested: policy_mod.Options,
        stack: *S,
        poisoned: bool = false,
        pub fn create(a: std.mem.Allocator, session: *A.Session, options: policy_mod.Options) !*Self {
            const p = try policy_mod.resolve(options);
            const s = try a.create(Self);
            errdefer a.destroy(s);
            const initial = try capture(a, session, p);
            errdefer initial.deinit();
            const stack = try S.createWithMetadata(a, p, initial, @sizeOf(Self));
            s.* = .{ .owner = session, .allocator = a, .requested = options, .stack = stack };
            return s;
        }
        pub fn deinit(self: *Self) void {
            const a = self.allocator;
            self.stack.deinit();
            a.destroy(self);
        }
        fn bind(self: *const Self, session: *A.Session) !void {
            if (self.poisoned) return error.HistoryMutationUncertain;
            if (self.owner != session) return error.SourceBindingMismatch;
        }
        fn capture(a: std.mem.Allocator, session: *A.Session, p: policy_mod.Policy) !*E {
            const cost = try A.payloadCost(session, p.max_checkpoint_bytes);
            const e = try E.create(a, p.max_retained_bytes, p.max_checkpoint_owned_bytes);
            errdefer e.deinit();
            const snapshot = A.capture(e.allocator(), session, p.max_checkpoint_bytes) catch |err| return e.captureError(err);
            e.finish(snapshot, cost);
            return e;
        }
        fn rollbackError(self: *Self, before: *A.Snapshot, failure: anyerror) anyerror {
            A.rollback(self.owner, before) catch {
                self.poisoned = true;
                return error.MutationUncertain;
            };
            return failure;
        }
        pub fn applyBatch(self: *Self, session: *A.Session, commands: []const A.Command) !bool {
            try self.bind(session);
            try self.stack.prepare();
            if (!try A.matches(&self.stack.current.value, session, self.stack.policy.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
            _ = try A.payloadCost(session, self.stack.policy.max_checkpoint_bytes);
            var before = try A.cloneForRestore(&self.stack.current.value, session, self.stack.policy.max_checkpoint_bytes);
            defer A.dispose(&before);
            const changed = A.apply(session, &before, commands, self.stack.policy.max_checkpoint_bytes) catch |err| return self.rollbackError(&before, err);
            if (!changed) {
                const same = A.matches(&self.stack.current.value, session, self.stack.policy.max_checkpoint_bytes) catch |err| return self.rollbackError(&before, err);
                if (!same) return self.rollbackError(&before, error.HistoryNoOpChangedState);
                return false;
            }
            const next = capture(self.allocator, session, self.stack.policy) catch |err| return self.rollbackError(&before, err);
            var next_owned = true;
            defer if (next_owned) next.deinit();
            const plan = self.stack.plan(next) catch |err| return self.rollbackError(&before, err);
            self.stack.commit(plan) catch |err| return self.rollbackError(&before, err);
            next_owned = false;
            return true;
        }
        fn restore(e: *const E, self: *Self) !void {
            if (!try A.matches(&self.stack.current.value, self.owner, self.stack.policy.max_checkpoint_bytes)) return error.HistoryCurrentMismatch;
            var parent = try A.cloneForRestore(&e.value, self.owner, self.stack.policy.max_checkpoint_bytes);
            defer A.dispose(&parent);
            try A.exchange(self.owner, &parent);
        }
        pub fn undo(self: *Self, session: *A.Session) !bool {
            try self.bind(session);
            return self.stack.move(false, self, restore);
        }
        pub fn redo(self: *Self, session: *A.Session) !bool {
            try self.bind(session);
            return self.stack.move(true, self, restore);
        }
    };
}
