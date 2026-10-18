//! Preserve one observed empty marker; never execute or certify a signature.
const std = @import("std");
const rules = @import("../body/control_rules.zig");
const field = @import("../body/field_start.zig");

pub fn properties(value: field.Properties) bool {
    return value.attributes == 0 and value.other == 0 and
        @import("../body/revision_sign_field.zig").isCommand(value.command) and
        value.extra.len == 4 and std.mem.allEqual(u8, value.extra, 0);
}

pub fn header(value: @import("../body/control_header.zig").Header) !bool {
    if (value.id != rules.id("%unk") and value.id != rules.id("%sig")) return false;
    return properties(try field.Properties.parse(value.properties));
}

pub fn collect(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: @import("../../model/document.zig").Section) ![]@import("field_bindings.zig").Binding {
    const rows = try @import("field_bindings.zig").collectReadable(a, source, version, section);
    errdefer a.free(rows);
    for (rows) |row| {
        if (@import("local_field_spans.zig").supportsMixedEditableKind(row.span.field_id)) continue;
        if (row.span.field_id != rules.id("%sig") or !properties(row.properties)) return error.UnsupportedSectionControl;
        if (row.span.begin.paragraph != row.span.end.paragraph or row.span.begin.unit != row.span.end.unit) return error.UnsupportedRetainedRevisionSign;
    }
    return rows;
}
