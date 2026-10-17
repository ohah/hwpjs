//! Current values -> transient source diff -> two replacements in the common ZIP save.
const std = @import("std");
const zip = @import("../zip/archive.zig");
const Replacement = @import("../zip/replace_writer.zig").Replacement;
pub fn append(a: std.mem.Allocator, source: []const u8, values: *const @import("chart_resource_values.zig").Values, replacements: *std.ArrayList(Replacement), max_bytes: usize, allow_observed_deviations: bool) !void {
    if (values.entries.items.len == 0) return;
    var archive = try zip.open(a, source, .{});
    defer archive.deinit();
    for (values.entries.items) |entry| {
        try appendPair(a, &archive, entry, replacements, max_bytes, allow_observed_deviations);
        for (entry.aliases) |alias| {
            var associated = entry;
            associated.chart_path = alias.chart_path;
            associated.ole_path = alias.ole_path;
            try appendPair(a, &archive, associated, replacements, max_bytes, allow_observed_deviations);
        }
    }
}

fn appendPair(a: std.mem.Allocator, archive: *@import("../zip/archive.zig").Archive, entry: @import("chart_resource_values.zig").Entry, replacements: *std.ArrayList(Replacement), max_bytes: usize, allow_observed_deviations: bool) !void {
    var chart_id: ?usize = null;
    var ole_id: ?usize = null;
    for (archive.entries, 0..) |part, index| {
        if (std.mem.eql(u8, part.name, entry.chart_path)) chart_id = index;
        if (std.mem.eql(u8, part.name, entry.ole_path)) ole_id = index;
    }
    const chart_index = chart_id orelse return error.MissingChartEntry;
    const ole_index = ole_id orelse return error.MissingOleEntry;
    const xml = try archive.decode(archive.entries[chart_index], max_bytes);
    defer a.free(xml);
    const payload = try archive.decode(archive.entries[ole_index], max_bytes);
    defer a.free(payload);
    var tree = try @import("chart_tree.zig").parse(a, xml, chart_index, .{ .max_xml_bytes = max_bytes });
    defer tree.deinit(a);
    try entry.points.validateSource(&tree);
    var original = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer original.deinit(a);
    if (original.points.len != entry.points.points.len) return error.SourceBindingMismatch;
    var edits: std.ArrayList(@import("chart_point_write.zig").Edit) = .empty;
    defer edits.deinit(a);
    for (original.points, entry.points.points, 0..) |before, after, ordinal| {
        if (before.index != after.index or before.kind != after.kind or before.cache_node != after.cache_node or before.level_node != after.level_node or before.value_node != after.value_node) return error.SourceBindingMismatch;
        if (!std.mem.eql(u8, before.value, after.value)) try edits.append(a, .{ .point = ordinal, .value = after.value });
    }
    if (edits.items.len == 0 and entry.series_text == null and entry.rich_text == null) return;
    var candidate = try @import("chart_point_write.zig").write(a, &tree, &original, edits.items, max_bytes);
    var transferred = false;
    defer if (!transferred) a.free(candidate);
    var series_changed = false;
    if (entry.series_text) |text| if (try @import("chart_series_resource_save.zig").apply(a, &tree, &text, candidate, max_bytes)) |updated| {
        a.free(candidate);
        candidate = updated;
        series_changed = true;
    };
    var rich_changed = false;
    if (entry.rich_text) |text| if (try @import("chart_rich_resource_save.zig").apply(a, &tree, &text, candidate, max_bytes)) |updated| {
        a.free(candidate);
        candidate = updated;
        rich_changed = true;
    };
    if (edits.items.len == 0 and !series_changed and !rich_changed) return;
    var ole_candidate = try @import("chart_ole_candidate.zig").prepare(a, payload, xml, candidate, .{ .max_output_bytes = max_bytes, .allow_observed_deviations = allow_observed_deviations });
    defer if (!transferred) ole_candidate.deinit(a);
    const chart_present = try alreadyPrepared(replacements.items, chart_index, candidate);
    const ole_present = try alreadyPrepared(replacements.items, ole_index, ole_candidate.bytes);
    try replacements.ensureUnusedCapacity(a, @as(usize, @intFromBool(!chart_present)) + @intFromBool(!ole_present));
    transferred = true;
    if (chart_present) a.free(candidate) else replacements.appendAssumeCapacity(.{ .entry_index = chart_index, .bytes = candidate });
    if (ole_present) ole_candidate.deinit(a) else replacements.appendAssumeCapacity(.{ .entry_index = ole_index, .bytes = ole_candidate.bytes });
}

fn alreadyPrepared(replacements: []const Replacement, index: usize, bytes: []const u8) !bool {
    for (replacements) |replacement| {
        if (replacement.entry_index != index) continue;
        if (!std.mem.eql(u8, replacement.bytes, bytes)) return error.ChartRepresentationMismatch;
        return true;
    }
    return false;
}
