//! 공통 V2 ring/회계 SSOT. 포맷별 소유권 승격은 명시 comptime adapter만 담당한다.
const std = @import("std");
const policies = @import("history_policy.zig");
const rings = @import("history_delta_deque.zig");
pub fn Stack(comptime E: type) type {
    return Engine(E, NoUpgrade(E), false);
}

pub fn StackWithAdapter(comptime E: type, comptime Adapter: type) type {
    return Engine(E, Adapter, true);
}

fn NoUpgrade(comptime E: type) type {
    return struct {
        pub const Upgrade = void;
        pub fn upgradeOwnedBytes(_: ?Upgrade) usize {
            return 0;
        }
        pub fn validateUpgrade(_: *const E, upgrade: ?Upgrade) !void {
            if (upgrade != null) return error.UnsupportedCheckpointUpgrade;
        }
        pub fn commitUpgrade(_: *E, upgrade: ?Upgrade) void {
            std.debug.assert(upgrade == null);
        }
    };
}

fn Engine(comptime E: type, comptime Adapter: type, comptime tracked_plans: bool) type {
    return struct {
        const Self = @This();
        const Ring = rings.PointerRing(E);
        pub const Plan = struct { epoch: u64, next: *E, evict: usize, retained: usize, upgrade: ?Adapter.Upgrade = null };
        pub const Counters = struct {
            plan_eviction_entry_visits: usize = 0,
            shifted_entry_slots: usize = 0,
            recount_calls: usize = 0,
            stats_scan_entry_visits: usize = 0,
            stats_reads: usize = 0,
            evicted_entries: usize = 0,
            redo_entries_freed: usize = 0,
        };
        allocator: std.mem.Allocator,
        policy: policies.Policy,
        current: *E,
        undo: Ring,
        redo: Ring,
        undo_len: usize = 0,
        redo_len: usize = 0,
        next_revision: u32 = 1,
        epoch: u64 = 0,
        metadata_bytes: usize,
        retained_bytes: usize,
        evicted: usize = 0,
        counters: Counters = .{},
        fn add(a: usize, b: usize) !usize {
            return std.math.add(usize, a, b) catch error.HistoryRetainedLimitExceeded;
        }
        fn check(p: policies.Policy, entry: *const E) !void {
            if (!entry.ready) return error.InvalidCheckpoint;
            if (entry.payload_bytes > p.max_checkpoint_bytes) return error.HistoryCheckpointPayloadLimitExceeded;
            if (p.max_checkpoint_owned_bytes) |cap| if (entry.ownedBytes() > cap) return error.HistoryEntryOwnedLimitExceeded;
        }
        fn syncCounts(self: *Self) void {
            self.undo_len = self.undo.len;
            self.redo_len = self.redo.len;
        }
        pub fn create(a: std.mem.Allocator, p: policies.Policy, current: *E) !*Self {
            return createWithMetadata(a, p, current, 0);
        }
        pub fn createWithMetadata(a: std.mem.Allocator, p: policies.Policy, current: *E, owner_bytes: usize) !*Self {
            _ = try policies.resolve(.{ .max_entries = p.max_entries, .max_checkpoint_bytes = p.max_checkpoint_bytes, .max_checkpoint_owned_bytes = p.max_checkpoint_owned_bytes, .max_retained_bytes = p.max_retained_bytes });
            try check(p, current);
            if (current.retained_by != null) return error.CheckpointAlreadyRetained;
            const slots = std.math.mul(usize, p.max_entries, 2 * @sizeOf(*E)) catch return error.HistoryRetainedLimitExceeded;
            const metadata = try add(try add(@sizeOf(Self), slots), owner_bytes);
            const total = try add(metadata, current.ownedBytes());
            if (total > p.max_retained_bytes) return error.HistoryRetainedLimitExceeded;
            const self = try a.create(Self);
            errdefer a.destroy(self);
            var undo = try Ring.init(a, p.max_entries);
            errdefer undo.deinit();
            var redo = try Ring.init(a, p.max_entries);
            errdefer redo.deinit();
            current.revision = 0;
            self.* = .{ .allocator = a, .policy = p, .current = current, .undo = undo, .redo = redo, .metadata_bytes = metadata, .retained_bytes = total };
            current.retained_by = self;
            return self;
        }
        pub fn deinit(self: *Self) void {
            const a = self.allocator;
            self.current.deinit();
            while (self.undo.popNewest()) |e| e.deinit();
            while (self.redo.popNewest()) |e| e.deinit();
            self.undo.deinit();
            self.redo.deinit();
            a.destroy(self);
        }
        pub fn prepare(self: *const Self) !void {
            if (self.next_revision == std.math.maxInt(u32) or self.epoch == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        }
        pub fn undoAt(self: *const Self, i: usize) ?*E {
            return self.undo.at(i);
        }
        pub fn redoAt(self: *const Self, i: usize) ?*E {
            return self.redo.at(i);
        }
        // 기존 Stack(E)의 const plan 호출을 보존한다. HX adapter는 기존 counter 경로도 보존한다.
        pub const plan = if (tracked_plans) trackedPlan else constPlan;
        fn constPlan(self: *const Self, next: *E) !Plan {
            return self.makePlan(next, null, null);
        }
        fn trackedPlan(self: *Self, next: *E) !Plan {
            return self.planUpgrade(next, null);
        }
        pub fn planUpgrade(self: *Self, next: *E, upgrade: ?Adapter.Upgrade) !Plan {
            return self.makePlan(next, upgrade, &self.counters);
        }
        fn makePlan(self: *const Self, next: *E, upgrade: ?Adapter.Upgrade, counters: ?*Counters) !Plan {
            try self.prepare();
            try check(self.policy, next);
            if (next.retained_by != null) return error.CheckpointAlreadyRetained;
            const current_cost = try add(self.current.ownedBytes(), Adapter.upgradeOwnedBytes(upgrade));
            try Adapter.validateUpgrade(self.current, upgrade);
            if (upgrade != null) {
                if (self.policy.max_checkpoint_owned_bytes) |cap| if (current_cost > cap) return error.HistoryEntryOwnedLimitExceeded;
            }
            const immediate = try add(try add(self.metadata_bytes, current_cost), next.ownedBytes());
            if (immediate > self.policy.max_retained_bytes) return error.HistoryRetainedLimitExceeded;
            var retained = try add(immediate, self.undo.owned_bytes);
            var evict: usize = 0;
            while (self.undo.len - evict + 1 > self.policy.max_entries or retained > self.policy.max_retained_bytes) : (evict += 1) {
                const entry = self.undo.at(evict) orelse return error.HistoryRetainedLimitExceeded;
                if (counters) |c| c.plan_eviction_entry_visits += 1;
                retained -= entry.ownedBytes();
            }
            return .{ .epoch = self.epoch, .next = next, .evict = evict, .retained = retained, .upgrade = upgrade };
        }
        pub fn commit(self: *Self, p: Plan) !void {
            if (p.epoch != self.epoch) return error.StaleHistoryPlan;
            const verified = try self.makePlan(p.next, p.upgrade, &self.counters);
            if (verified.evict != p.evict or verified.retained != p.retained) return error.StaleHistoryPlan;
            while (self.redo.popNewest()) |e| {
                e.deinit();
                self.counters.redo_entries_freed += 1;
            }
            for (0..p.evict) |_| {
                const old = self.undo.popOldest().?;
                old.deinit();
                self.counters.evicted_entries += 1;
            }
            Adapter.commitUpgrade(self.current, p.upgrade);
            self.undo.push(self.current) catch unreachable;
            p.next.retained_by = self;
            p.next.revision = self.next_revision;
            self.current = p.next;
            self.next_revision += 1;
            self.epoch += 1;
            self.evicted += p.evict;
            self.retained_bytes = p.retained;
            self.syncCounts();
            // recount를 여기서 호출하면 ReleaseSafe 매 키 O(R)이 되므로 명시 audit에만 남긴다.
        }
        pub fn move(self: *Self, is_redo: bool, context: anytype, comptime restore: anytype) !bool {
            const n = if (is_redo) self.redo.len else self.undo.len;
            if (n == 0) return false;
            if (self.epoch == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
            const target = (if (is_redo) self.redo.at(n - 1) else self.undo.at(n - 1)).?;
            try restore(target, context);
            if (is_redo) {
                _ = self.redo.popNewest();
                self.undo.push(self.current) catch unreachable;
            } else {
                _ = self.undo.popNewest();
                self.redo.push(self.current) catch unreachable;
            }
            self.current = target;
            self.epoch += 1;
            self.syncCounts();
            return true;
        }
        pub fn runningOwnedTotals(self: *Self) struct { undo: usize, redo: usize } {
            self.counters.stats_reads += 1;
            return .{ .undo = self.undo.owned_bytes, .redo = self.redo.owned_bytes };
        }
        /// 고비용 O(R) audit. 정상 commit/move/stats에서는 호출하지 않는다.
        pub fn recount(self: *Self) usize {
            self.counters.recount_calls += 1;
            var total = self.metadata_bytes + self.current.ownedBytes();
            for (0..self.undo.len) |i| total += self.undo.at(i).?.ownedBytes();
            for (0..self.redo.len) |i| total += self.redo.at(i).?.ownedBytes();
            return total;
        }
        pub fn oldestAvailableRevision(self: *const Self) u32 {
            var oldest = self.current.revision;
            if (self.undo.at(0)) |e| oldest = @min(oldest, e.revision);
            if (self.redo.len != 0) oldest = @min(oldest, self.redo.at(self.redo.len - 1).?.revision);
            return oldest;
        }
        pub fn revisionCount(self: *const Self) usize {
            return 1 + self.undo.len + self.redo.len;
        }
        pub fn revisionAt(self: *const Self, i: usize) ?u32 {
            if (i == 0) return self.current.revision;
            if (i <= self.undo.len) return self.undo.at(i - 1).?.revision;
            const j = i - 1 - self.undo.len;
            return if (self.redo.at(j)) |e| e.revision else null;
        }
    };
}
