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
pub const EndReport = struct {
    ends: usize,
    lists: usize,
    matched_ends: usize,
    cross_section_ends: usize,
    missing_targets: usize,
    ambiguous_ends: usize,
    unreferenced_lists: usize,
    duplicate_end_ids: usize,
    duplicate_list_ids: usize,
    pub fn validateKnown(self: EndReport) !void {
        if (self.missing_targets != 0) return error.MissingMemoEndTarget;
        if (self.ambiguous_ends != 0) return error.AmbiguousMemoEndTarget;
    }
};
/// Owns observed rows only; never allocates from an ID or declared resource count.
pub const Index = struct {
    fields: std.ArrayList(Entry) = .empty,
    lists: std.ArrayList(Entry) = .empty,
    ends: std.ArrayList(Entry) = .empty,
    missing_indices: usize = 0,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.fields.deinit(a);
        self.lists.deinit(a);
        self.ends.deinit(a);
        self.* = undefined;
    }
    pub fn addField(self: *Index, a: std.mem.Allocator, id: ?u32, section: usize) !void {
        if (id) |value| try self.fields.append(a, .{ .id = value, .section = section }) else self.missing_indices += 1;
    }
    pub fn addList(self: *Index, a: std.mem.Allocator, id: u32, section: usize) !void {
        try self.lists.append(a, .{ .id = id, .section = section });
    }
    pub fn inspect(self: *Index) Report {
        return inspectRows(self.fields.items, self.lists.items, self.missing_indices);
    }
    pub fn addEnd(self: *Index, a: std.mem.Allocator, id: u32, section: usize) !void {
        try self.ends.append(a, .{ .id = id, .section = section });
    }
    pub fn inspectEnds(self: *Index) EndReport {
        const r = inspectRows(self.ends.items, self.lists.items, 0);
        return .{ .ends = r.fields, .lists = r.lists, .matched_ends = r.matched_fields, .cross_section_ends = r.cross_section_fields, .missing_targets = r.missing_targets, .ambiguous_ends = r.ambiguous_fields, .unreferenced_lists = r.unreferenced_lists, .duplicate_end_ids = r.duplicate_field_ids, .duplicate_list_ids = r.duplicate_list_ids };
    }
};
/// Both source kinds share one target table and one grouping/matching algorithm.
fn inspectRows(fields: []Entry, lists: []Entry, missing_indices: usize) Report {
    std.mem.sort(Entry, fields, {}, less);
    std.mem.sort(Entry, lists, {}, less);
    var report: Report = .{ .fields = fields.len + missing_indices, .lists = lists.len, .missing_indices = missing_indices };
    var f: usize = 0;
    var m: usize = 0;
    while (f < fields.len or m < lists.len) {
        const id = if (f == fields.len) lists[m].id else if (m == lists.len) fields[f].id else @min(fields[f].id, lists[m].id);
        var fe = f;
        var me = m;
        while (fe < fields.len and fields[fe].id == id) : (fe += 1) {}
        while (me < lists.len and lists[me].id == id) : (me += 1) {}
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
            for (fields[f..fe]) |field| report.cross_section_fields += @intFromBool(field.section != lists[m].section);
        }
        f = fe;
        m = me;
    }
    return report;
}
fn less(_: void, left: Entry, right: Entry) bool {
    return left.id < right.id or (left.id == right.id and left.section < right.section);
}
