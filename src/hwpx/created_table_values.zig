//! Owned staged tables and their host points; never stores serialized XML.
const std = @import("std");
const model = @import("../model/created_table.zig");
pub const Entry = struct { anchor: @import("created_table_anchor.zig").Anchor, table: model.Table };
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |*entry| entry.table.deinit(a);
        self.entries.deinit(a);
        self.* = undefined;
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var result: Values = .{};
        errdefer result.deinit(a);
        try result.entries.ensureTotalCapacityPrecise(a, self.entries.items.len);
        for (self.entries.items) |entry| result.entries.appendAssumeCapacity(.{ .anchor = entry.anchor, .table = try entry.table.clone(a) });
        return result;
    }
    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var total = std.math.mul(usize, self.entries.capacity, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (total > limit) return error.LimitExceeded;
        for (self.entries.items) |entry| {
            const bytes = std.math.mul(usize, entry.table.cells.len, @sizeOf(model.Cell)) catch return error.LimitExceeded;
            total = std.math.add(usize, total, bytes) catch return error.LimitExceeded;
            if (total > limit) return error.LimitExceeded;
            for (entry.table.cells) |cell| {
                total = std.math.add(usize, total, cell.text.len) catch return error.LimitExceeded;
                if (total > limit) return error.LimitExceeded;
            }
        }
        return total;
    }
    /// Called on a private transaction candidate; caller swaps only on success.
    pub fn append(self: *Values, a: std.mem.Allocator, anchor: @import("created_table_anchor.zig").Anchor, table: *const model.Table, max_entries: usize) !void {
        if (self.entries.items.len >= max_entries) return error.LimitExceeded;
        var ids: std.AutoHashMap(u32, void) = .init(a);
        defer ids.deinit();
        for (self.entries.items) |entry| {
            if (entry.table.identity == table.identity or entry.table.instance_id == table.instance_id) return error.InvalidCreatedTableIdentity;
            for (entry.table.cells) |cell| try ids.put(cell.paragraph_id, {});
        }
        for (table.cells) |cell| if ((try ids.getOrPut(cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
        var copy = try table.clone(a);
        errdefer copy.deinit(a);
        try self.entries.append(a, .{ .anchor = anchor, .table = copy });
    }
};
