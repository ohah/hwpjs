const std = @import("std");
const Entry = struct { id: u32, section: usize };
pub const Report = struct {
    fields: usize = 0,
    lists: usize = 0,
    missing_indices: usize = 0,
    matched_fields: usize = 0,
    cross_section_fields: usize = 0,
    missing_targets: usize = 0,
    ambiguous_fields: usize = 0,
    unreferenced_lists: usize = 0,
    duplicate_field_ids: usize = 0,
    duplicate_list_ids: usize = 0,
    pub fn validateKnown(self: Report) !void {
        if (self.missing_targets != 0) return error.MissingMemoTarget;
        if (self.ambiguous_fields != 0) return error.AmbiguousMemoTarget;
    }
};
pub const Collector = struct { index: *Index, allocator: std.mem.Allocator, section: usize };
/// Owns observed rows only; never allocates from an ID or declared resource count.
pub const Index = struct {
    fields: std.ArrayList(Entry) = .empty,
    lists: std.ArrayList(Entry) = .empty,
    missing_indices: usize = 0,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.fields.deinit(a);
        self.lists.deinit(a);
        self.* = undefined;
    }
    pub fn addField(self: *Index, a: std.mem.Allocator, id: ?u32, section: usize) !void {
        if (id) |value| try self.fields.append(a, .{ .id = value, .section = section }) else self.missing_indices += 1;
    }
    pub fn addList(self: *Index, a: std.mem.Allocator, id: u32, section: usize) !void {
        try self.lists.append(a, .{ .id = id, .section = section });
    }
    pub fn inspect(self: *Index) Report {
        std.mem.sort(Entry, self.fields.items, {}, less);
        std.mem.sort(Entry, self.lists.items, {}, less);
        var report: Report = .{ .fields = self.fields.items.len + self.missing_indices, .lists = self.lists.items.len, .missing_indices = self.missing_indices };
        var f: usize = 0;
        var m: usize = 0;
        while (f < self.fields.items.len or m < self.lists.items.len) {
            const id = if (f == self.fields.items.len) self.lists.items[m].id else if (m == self.lists.items.len) self.fields.items[f].id else @min(self.fields.items[f].id, self.lists.items[m].id);
            var fe = f;
            var me = m;
            while (fe < self.fields.items.len and self.fields.items[fe].id == id) : (fe += 1) {}
            while (me < self.lists.items.len and self.lists.items[me].id == id) : (me += 1) {}
            const fnn = fe - f;
            const mn = me - m;
            report.duplicate_field_ids += @intFromBool(fnn > 1);
            report.duplicate_list_ids += @intFromBool(mn > 1);
            if (fnn == 0) {
                report.unreferenced_lists += mn;
            } else if (mn == 0) {
                report.missing_targets += fnn;
            } else if (mn > 1) {
                report.ambiguous_fields += fnn;
            } else {
                report.matched_fields += fnn;
                for (self.fields.items[f..fe]) |field| report.cross_section_fields += @intFromBool(field.section != self.lists.items[m].section);
            }
            f = fe;
            m = me;
        }
        return report;
    }
};
fn less(_: void, left: Entry, right: Entry) bool {
    return left.id < right.id or (left.id == right.id and left.section < right.section);
}
