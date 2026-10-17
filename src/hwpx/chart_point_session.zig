//! Validate a cloned current owner and complete save before atomic publication.
const std = @import("std");
const Edit = @import("chart_point_write.zig").Edit;
pub fn set(session: *@import("editor_session.zig").Session, section_index: usize, wrapper: usize, point: usize, value: []const u8) !bool {
    return setManyMode(session, section_index, wrapper, &.{.{ .point = point, .value = value }}, false);
}
pub fn setNumeric(session: *@import("editor_session.zig").Session, section_index: usize, wrapper: usize, point: usize, value: []const u8) !bool {
    return setManyMode(session, section_index, wrapper, &.{.{ .point = point, .value = value }}, true);
}
pub fn setMany(session: *@import("editor_session.zig").Session, section_index: usize, wrapper: usize, edits: []const Edit) !bool {
    return setManyMode(session, section_index, wrapper, edits, false);
}
fn setManyMode(session: *@import("editor_session.zig").Session, section_index: usize, wrapper: usize, edits: []const Edit, numeric_only: bool) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (numeric_only) for (edits) |edit| try @import("chart_point_write.zig").validateNumeric(edit.value);
    const a = session.allocator;
    var source = try @import("chart_source_context.zig").load(a, session, section_index, wrapper);
    defer source.deinit(a);
    var original = try @import("chart_point_values.zig").collect(a, &source.tree, .{});
    defer original.deinit(a);
    const current = try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path);
    if (current) |existing| try existing.points.validateSource(&source.tree);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var changed = false;
    for (edits) |edit| {
        if (edit.point >= original.points.len) return error.InvalidChartPointIndex;
        if (edits.len > 1 and (try seen.getOrPut(a, edit.point)).found_existing) return error.DuplicateChartPointEdit;
        const point = original.points[edit.point];
        if (numeric_only and point.kind != .numeric_cache and point.kind != .numeric_literal) return error.UnsupportedChartPointKind;
        try @import("chart_point_write.zig").validateValue(point.kind, edit.value);
        const before = if (current) |existing| existing.points.points[edit.point].value else point.value;
        changed = changed or !std.mem.eql(u8, before, edit.value);
    }
    if (!changed) return false;
    var candidate = try session.chart_resources.clone(a);
    defer candidate.deinit(a);
    const resource = try candidate.add(a, &source.pair, &original);
    if (current == null) {
        const group = try @import("chart_resource_group.zig").collect(a, session, &source.pair);
        defer @import("chart_resource_group.zig").deinit(a, group);
        try @import("chart_resource_values.zig").Values.bindAliases(a, resource, group);
    }
    for (edits) |edit| {
        if (std.mem.eql(u8, resource.points.points[edit.point].value, edit.value)) continue;
        const owned = try a.dupe(u8, edit.value);
        a.free(resource.points.points[edit.point].value);
        resource.points.points[edit.point].value = owned;
    }
    _ = try candidate.byteSize(session.options.max_output_bytes);
    var proxy = session.*;
    proxy.chart_resources = candidate;
    const checked = try proxy.save();
    defer a.free(checked);
    std.mem.swap(@import("chart_resource_values.zig").Values, &session.chart_resources, &candidate);
    return true;
}
