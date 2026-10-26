//! Section-local generated tables. No record cache or UI-owned strings.
const std = @import("std");
const Value = @import("created_table_value.zig").Value;
pub const Host = @import("created_table_anchor.zig").Host;
pub const Anchor = @import("created_table_anchor.zig").Anchor;
pub const Entry = struct { anchor: Anchor, value: Value };

pub const Values = struct {
    entries: []Entry = &.{},

    pub fn equals(self: *const Values, other: *const Values) bool {
        if (self.entries.len != other.entries.len) return false;
        for (self.entries, other.entries) |left, right| {
            if (!std.meta.eql(left.anchor, right.anchor)) return false;
            if (!@import("../../model/equality.zig").semantic(Value, left.value, right.value)) return false;
        }
        return true;
    }

    /// Two passes avoid partial mutation if a later anchor is protected/overflows.
    /// Caller commits this together with the corresponding text transaction.
    pub fn rebase(self: *Values, host: Host, start: u32, deleted: u32, inserted: u32) !void {
        const map = @import("../../model/protected_point_splice.zig").unit;
        _ = try map(0, start, deleted, inserted);
        for (self.entries) |entry| {
            if (std.meta.eql(entry.anchor.host, host)) _ = try map(entry.anchor.unit, start, deleted, inserted);
        }
        for (self.entries) |*entry| {
            if (std.meta.eql(entry.anchor.host, host)) entry.anchor.unit = map(entry.anchor.unit, start, deleted, inserted) catch unreachable;
        }
    }

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries) |*entry| entry.value.deinit(a);
        a.free(self.entries);
        self.* = undefined;
    }

    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var total: usize = 0;
        for (self.entries) |entry| {
            const bytes = Value.ownedSize(&entry.value.table, entry.value.options) catch return error.LimitExceeded;
            total = std.math.add(usize, total, @sizeOf(Entry) - @sizeOf(Value)) catch return error.LimitExceeded;
            total = std.math.add(usize, total, bytes) catch return error.LimitExceeded;
            if (total > limit) return error.LimitExceeded;
        }
        return total;
    }

    pub fn clone(self: *const Values, a: std.mem.Allocator, limit: usize) !Values {
        _ = try self.byteSize(limit);
        const entries = try a.alloc(Entry, self.entries.len);
        var initialized: usize = 0;
        errdefer {
            for (entries[0..initialized]) |*entry| entry.value.deinit(a);
            a.free(entries);
        }
        for (self.entries, entries) |source, *target| {
            target.* = .{ .anchor = source.anchor, .value = try source.value.clone(a, limit) };
            initialized += 1;
        }
        return .{ .entries = entries };
    }

    /// Atomic append; document-wide references and host boundaries are admitted
    /// by Session before this section-local ownership transaction.
    pub fn append(self: *Values, a: std.mem.Allocator, anchor: Anchor, source: *const Value, max_entries: usize, limit: usize) !void {
        if (self.entries.len >= max_entries) return error.LimitExceeded;
        switch (anchor.host) {
            .original_node => {}, // Source record zero is a valid identity.
            .generated_instance => |id| if (id == 0) return error.InvalidTableOwner,
        }
        if (source.table.identity == 0 or source.table.instance_id == 0) return error.InvalidCreatedTableIdentity;
        const old_size = try self.byteSize(limit);
        const bytes = Value.ownedSize(&source.table, source.options) catch return error.LimitExceeded;
        const increment = std.math.add(usize, bytes, @sizeOf(Entry) - @sizeOf(Value)) catch return error.LimitExceeded;
        const next_size = std.math.add(usize, old_size, increment) catch return error.LimitExceeded;
        if (next_size > limit) return error.LimitExceeded;
        var ids: std.AutoHashMap(u32, void) = .init(a);
        defer ids.deinit();
        for (self.entries) |entry| {
            if (entry.value.table.identity == source.table.identity or entry.value.table.instance_id == source.table.instance_id) return error.InvalidCreatedTableIdentity;
            for (entry.value.table.cells) |cell| try ids.put(cell.paragraph_id, {});
        }
        for (source.table.cells) |cell| {
            if (cell.paragraph_id == 0 or (try ids.getOrPut(cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
        }
        var copy = try source.clone(a, limit);
        errdefer copy.deinit(a);
        const count = std.math.add(usize, self.entries.len, 1) catch return error.LimitExceeded;
        const entries = try a.alloc(Entry, count);
        @memcpy(entries[0..self.entries.len], self.entries);
        entries[self.entries.len] = .{ .anchor = anchor, .value = copy };
        a.free(self.entries);
        self.entries = entries;
    }
};
