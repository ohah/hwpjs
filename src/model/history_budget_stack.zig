//! Immutable checkpoint ownership. Restore callback must be failure atomic.
const std = @import("std");
const policies = @import("history_policy.zig");
pub fn Stack(comptime E: type) type {
    return struct {
        const Self = @This();
        pub const Plan = struct { epoch: u64, next: *E, evict: usize, retained: usize };
        allocator: std.mem.Allocator,
        policy: policies.Policy,
        current: *E,
        undo_slots: []*E,
        redo_slots: []*E,
        undo_len: usize = 0,
        redo_len: usize = 0,
        next_revision: u32 = 1,
        epoch: u64 = 0,
        metadata_bytes: usize,
        retained_bytes: usize,
        evicted: usize = 0,
        fn add(a: usize, b: usize) !usize {
            return std.math.add(usize, a, b) catch error.HistoryRetainedLimitExceeded;
        }
        fn check(p: policies.Policy, entry: *const E) !void {
            if (!entry.ready) return error.InvalidCheckpoint;
            if (entry.payload_bytes > p.max_checkpoint_bytes) return error.HistoryCheckpointPayloadLimitExceeded;
            if (p.max_checkpoint_owned_bytes) |cap| if (entry.ownedBytes() > cap) return error.HistoryEntryOwnedLimitExceeded;
        }
        pub fn create(a: std.mem.Allocator, p: policies.Policy, current: *E) !*Self {
            return createWithMetadata(a, p, current, 0);
        }
        pub fn createWithMetadata(a: std.mem.Allocator, p: policies.Policy, current: *E, owner_bytes: usize) !*Self {
            _ = try policies.resolve(.{ .max_entries = p.max_entries, .max_checkpoint_bytes = p.max_checkpoint_bytes, .max_checkpoint_owned_bytes = p.max_checkpoint_owned_bytes, .max_retained_bytes = p.max_retained_bytes });
            try check(p, current);
            if (current.retained_by != null) return error.CheckpointAlreadyRetained;
            const slots = std.math.mul(usize, p.max_entries, 2 * @sizeOf(*E)) catch return error.HistoryRetainedLimitExceeded;
            const meta = try add(try add(@sizeOf(Self), slots), owner_bytes);
            const total = try add(meta, current.ownedBytes());
            if (total > p.max_retained_bytes) return error.HistoryRetainedLimitExceeded;
            const s = try a.create(Self);
            errdefer a.destroy(s);
            const undo = try a.alloc(*E, p.max_entries);
            errdefer a.free(undo);
            const redo = try a.alloc(*E, p.max_entries);
            errdefer a.free(redo);
            current.revision = 0;
            s.* = .{ .allocator = a, .policy = p, .current = current, .undo_slots = undo, .redo_slots = redo, .metadata_bytes = meta, .retained_bytes = total };
            current.retained_by = s;
            return s;
        }
        pub fn deinit(self: *Self) void {
            const a = self.allocator;
            self.current.deinit();
            for (self.undo_slots[0..self.undo_len]) |e| e.deinit();
            for (self.redo_slots[0..self.redo_len]) |e| e.deinit();
            a.free(self.undo_slots);
            a.free(self.redo_slots);
            a.destroy(self);
        }
        pub fn prepare(self: *const Self) !void {
            if (self.next_revision == std.math.maxInt(u32) or self.epoch == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        }
        pub fn plan(self: *const Self, next: *E) !Plan {
            try self.prepare();
            try check(self.policy, next);
            if (next.retained_by != null) return error.CheckpointAlreadyRetained;
            // Keep one immediate undo. No count*maximum-byte conservative rejection.
            var retained = try add(try add(self.metadata_bytes, self.current.ownedBytes()), next.ownedBytes());
            if (retained > self.policy.max_retained_bytes) return error.HistoryRetainedLimitExceeded;
            for (self.undo_slots[0..self.undo_len]) |e| retained = try add(retained, e.ownedBytes());
            var evict: usize = 0;
            while (self.undo_len - evict + 1 > self.policy.max_entries or retained > self.policy.max_retained_bytes) : (evict += 1) {
                retained -= self.undo_slots[evict].ownedBytes();
            }
            return .{ .epoch = self.epoch, .next = next, .evict = evict, .retained = retained };
        }
        pub fn commit(self: *Self, p: Plan) !void {
            if (p.epoch != self.epoch) return error.StaleHistoryPlan;
            const verified = try self.plan(p.next);
            if (verified.evict != p.evict or verified.retained != p.retained) return error.StaleHistoryPlan;
            for (self.redo_slots[0..self.redo_len]) |e| e.deinit();
            self.redo_len = 0;
            for (self.undo_slots[0..p.evict]) |e| e.deinit();
            const left = self.undo_len - p.evict;
            std.mem.copyForwards(*E, self.undo_slots[0..left], self.undo_slots[p.evict..self.undo_len]);
            self.undo_slots[left] = self.current;
            self.undo_len = left + 1;
            p.next.retained_by = self;
            p.next.revision = self.next_revision;
            self.current = p.next;
            self.next_revision += 1;
            self.epoch += 1;
            self.evicted += p.evict;
            self.retained_bytes = p.retained;
            std.debug.assert(self.retained_bytes == self.recount());
        }
        pub fn move(self: *Self, redo: bool, context: anytype, comptime restore: anytype) !bool {
            const n = if (redo) self.redo_len else self.undo_len;
            if (n == 0) return false;
            if (self.epoch == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
            const target = if (redo) self.redo_slots[n - 1] else self.undo_slots[n - 1];
            try restore(target, context); // Parent clone first; errors must not change live state.
            if (redo) {
                self.undo_slots[self.undo_len] = self.current;
                self.undo_len += 1;
                self.redo_len -= 1;
            } else {
                self.redo_slots[self.redo_len] = self.current;
                self.redo_len += 1;
                self.undo_len -= 1;
            }
            self.current = target;
            self.epoch += 1;
            std.debug.assert(self.retained_bytes == self.recount());
            return true;
        }
        pub fn recount(self: *const Self) usize {
            var bytes = self.metadata_bytes + self.current.ownedBytes();
            for (self.undo_slots[0..self.undo_len]) |e| bytes += e.ownedBytes();
            for (self.redo_slots[0..self.redo_len]) |e| bytes += e.ownedBytes();
            return bytes;
        }
        pub fn oldestAvailableRevision(self: *const Self) u32 {
            var oldest = self.current.revision;
            for (self.undo_slots[0..self.undo_len]) |e| oldest = @min(oldest, e.revision);
            for (self.redo_slots[0..self.redo_len]) |e| oldest = @min(oldest, e.revision);
            return oldest;
        }
        pub fn revisionCount(self: *const Self) usize {
            return 1 + self.undo_len + self.redo_len;
        }
        pub fn revisionAt(self: *const Self, i: usize) ?u32 {
            if (i == 0) return self.current.revision;
            if (i <= self.undo_len) return self.undo_slots[i - 1].revision;
            const j = i - 1 - self.undo_len;
            return if (j < self.redo_len) self.redo_slots[j].revision else null;
        }
    };
}
