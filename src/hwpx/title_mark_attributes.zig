const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");

/// Raw optional ignore value. Missing is not converted to the XSD default.
pub const Report = struct {
    marks: usize = 0,
    ignore_present: usize = 0,
    ignore_true: usize = 0,
    ignore_false: usize = 0,
    ignore_other: usize = 0,
    extra_attributes: usize = 0,

    pub fn counts(self: Report) [6]u64 {
        return .{ self.marks, self.ignore_present, self.ignore_true, self.ignore_false, self.ignore_other, self.extra_attributes };
    }
};

pub fn noteTag(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, report: *Report) !void {
    const raw = try attrs.attribute(a, tag, scope, "ignore", max_attribute_bytes);
    defer if (raw) |value| a.free(value);
    report.marks += 1;
    if (raw) |value| {
        report.ignore_present += 1;
        const parsed: ?bool = values.boolean(value) catch null;
        if (parsed) |ignore| {
            if (ignore) report.ignore_true += 1 else report.ignore_false += 1;
        } else report.ignore_other += 1;
    }
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        if (name.uri.len != 0 or !name.local.equals("ignore", false)) report.extra_attributes += 1;
    }
}
