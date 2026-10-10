//! Map complete current formula endpoints, not individual result-site widths.
const std = @import("std");
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Boundaries = struct { start: ?u32 = null, end: ?u32 = null };

pub fn map(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: []const Segment, original: []const Segment, start: u32, end: u32) !Boundaries {
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const fields = try @import("field_text_ranges.zig").build(a, trees, &report);
    defer a.free(fields);
    var output: Boundaries = .{};
    for (fields) |field| {
        if (!std.mem.eql(u8, report.markers[field.begin_marker].begin.?.type_raw orelse "", "FORMULA")) continue;
        const shown = @import("field_text_positions.zig").project(field, section, current) orelse continue;
        const owned = @import("field_text_positions.zig").project(field, section, original) orelse return error.SourceBindingMismatch;
        try endpoint(&output.start, shown, owned, start);
        try endpoint(&output.end, shown, owned, end);
    }
    return output;
}

fn endpoint(output: *?u32, shown: @import("field_text_positions.zig").Span, owned: @import("field_text_positions.zig").Span, unit: u32) !void {
    const value = if (unit == shown.start_unit) owned.start_unit else if (unit == shown.end_unit) owned.end_unit else return;
    const mapped = std.math.cast(u32, value) orelse return error.LimitExceeded;
    if (output.*) |old| if (old != mapped) return error.SourceBindingMismatch;
    output.* = mapped;
}
