//! Series strings share the existing chart/OLE owner, aliases and checkpoint.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("chart_series_text_values.zig");

pub fn read(a: std.mem.Allocator, session: *editor.Session, section: usize, wrapper: usize) !model.Values {
    var source = try @import("chart_source_context.zig").load(a, session, section, wrapper);
    defer source.deinit(a);
    if (try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path)) |current| {
        if (current.series_text) |text| {
            try text.validateSource(&source.tree);
            return text.clone(a);
        }
    }
    return model.collect(a, &source.tree, .{});
}

pub fn set(session: *editor.Session, section: usize, wrapper: usize, ordinal: usize, text: []const u8) !bool {
    if (text.len > model.default_max_value_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(text)) return error.InvalidUtf8;
    const a = session.allocator;
    var source = try @import("chart_source_context.zig").load(a, session, section, wrapper);
    defer source.deinit(a);
    var original = try model.collect(a, &source.tree, .{});
    defer original.deinit(a);
    if (ordinal >= original.items.len) return error.InvalidChartSeriesTextIndex;
    const existing = try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path);
    const before = if (existing) |entry| if (entry.series_text) |current| block: {
        try current.validateSource(&source.tree);
        if (current.items.len != original.items.len) return error.SourceBindingMismatch;
        break :block current.items[ordinal].text;
    } else original.items[ordinal].text else original.items[ordinal].text;
    if (std.mem.eql(u8, before, text)) return false;
    var candidate = try session.chart_resources.clone(a);
    defer candidate.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &source.tree, .{});
    defer points.deinit(a);
    const entry = try candidate.add(a, &source.pair, &points);
    if (existing == null) {
        const group = try @import("chart_resource_group.zig").collect(a, session, &source.pair);
        defer @import("chart_resource_group.zig").deinit(a, group);
        try @import("chart_resource_values.zig").Values.bindAliases(a, entry, group);
    }
    if (entry.series_text == null) entry.series_text = try original.clone(a);
    const owned = try a.dupe(u8, text);
    a.free(entry.series_text.?.items[ordinal].text);
    entry.series_text.?.items[ordinal].text = owned;
    _ = try candidate.byteSize(session.options.max_output_bytes);
    var proxy = session.*;
    proxy.chart_resources = candidate;
    const checked = try proxy.save();
    defer a.free(checked);
    std.mem.swap(@import("chart_resource_values.zig").Values, &session.chart_resources, &candidate);
    return true;
}
