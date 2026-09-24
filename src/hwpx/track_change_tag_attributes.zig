const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");

pub const Kind = enum(u2) { insert_begin, insert_end, delete_begin, delete_end };

pub const Numeric = struct {
    present: usize = 0,
    zero: usize = 0,
    over_u32: usize = 0,
    invalid: usize = 0,
    sum_u32: u64 = 0,

    fn counts(self: Numeric) [5]u64 {
        return .{ self.present, self.zero, self.over_u32, self.invalid, self.sum_u32 };
    }
};

/// Direct hp:t track-change tag attributes, not a paired change range.
pub const Report = struct {
    kinds: [4]usize = @splat(0),
    id: Numeric = .{},
    tc_id: Numeric = .{},
    paraend_present: usize = 0,
    paraend_true: usize = 0,
    paraend_false: usize = 0,
    paraend_invalid: usize = 0,
    begin_paraend_present: usize = 0,
    extra_attributes: usize = 0,

    pub fn count(self: Report) usize {
        var total: usize = 0;
        for (self.kinds) |value| total += value;
        return total;
    }

    pub fn counts(self: Report) [20]u64 {
        const id = self.id.counts();
        const tc_id = self.tc_id.counts();
        return .{
            self.kinds[0],      self.kinds[1],        self.kinds[2],              self.kinds[3],
            id[0],              id[1],                id[2],                      id[3],
            id[4],              tc_id[0],             tc_id[1],                   tc_id[2],
            tc_id[3],           tc_id[4],             self.paraend_present,       self.paraend_true,
            self.paraend_false, self.paraend_invalid, self.begin_paraend_present, self.extra_attributes,
        };
    }
};

fn noteNumeric(raw: ?[]const u8, report: *Numeric) !void {
    const value = raw orelse return;
    report.present += 1;
    const zero = values.nonNegative(value) catch {
        report.invalid += 1;
        return;
    };
    if (zero) {
        report.zero += 1;
        return;
    }
    const trimmed = std.mem.trim(u8, value, " \t\r\n");
    const digits = if (trimmed[0] == '+') trimmed[1..] else trimmed;
    const parsed = std.fmt.parseInt(u32, digits, 10) catch {
        report.over_u32 += 1;
        return;
    };
    report.sum_u32 = std.math.add(u64, report.sum_u32, parsed) catch return error.LimitExceeded;
}

pub fn noteTag(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, kind: Kind, max_attribute_bytes: usize, report: *Report) !void {
    const id = try attrs.attribute(a, tag, scope, "Id", max_attribute_bytes);
    defer if (id) |value| a.free(value);
    const tc_id = try attrs.attribute(a, tag, scope, "TcId", max_attribute_bytes);
    defer if (tc_id) |value| a.free(value);
    const paraend = try attrs.attribute(a, tag, scope, "paraend", max_attribute_bytes);
    defer if (paraend) |value| a.free(value);

    report.kinds[@intFromEnum(kind)] += 1;
    try noteNumeric(id, &report.id);
    try noteNumeric(tc_id, &report.tc_id);
    if (paraend) |value| {
        report.paraend_present += 1;
        if (kind == .insert_begin or kind == .delete_begin) report.begin_paraend_present += 1;
        const parsed: ?bool = values.boolean(value) catch null;
        if (parsed) |valid| {
            if (valid) report.paraend_true += 1 else report.paraend_false += 1;
        } else report.paraend_invalid += 1;
    }
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        if (name.uri.len != 0 or !(name.local.equals("Id", false) or name.local.equals("TcId", false) or name.local.equals("paraend", false))) {
            report.extra_attributes += 1;
        }
    }
}
