//! 사이트 합집합에 현재 서식을 재바인딩하고 새 빈 사이트의 원본 서식을 연결합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Sites = @import("text_sites.zig").Sites;
const paint = @import("character_style_paint.zig");
const Key = struct { element: usize, start: usize };
const Range = struct { start: usize, end: usize };

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Paragraph, selected: *const Sites) !?[]paint.Span {
    const styles = original.character_styles orelse return null;
    const units = if (styles.len == 0) 0 else styles[styles.len - 1].end_unit;
    const validated = try @import("character_style_split.zig").side(a, styles, &original.sites, &original.sites, std.math.cast(u32, units) orelse return error.LimitExceeded, false, 1_000_000);
    defer a.free(validated);
    var mapping: std.AutoHashMapUnmanaged(Key, usize) = .empty;
    defer mapping.deinit(a);
    const ranges = try a.alloc(Range, original.sites.items.len);
    defer a.free(ranges);
    var cursor: usize = 0;
    for (original.sites.items, 0..) |site, index| {
        const entry = try mapping.getOrPut(a, .{ .element = site.element_index, .start = site.start });
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
        const start = cursor;
        while (cursor < validated.len and validated[cursor].site_index == index) : (cursor += 1) {}
        if (cursor == start) return error.InvalidTextSites;
        ranges[index] = .{ .start = start, .end = cursor };
    }
    if (cursor != validated.len) return error.InvalidTextSites;
    var view = original.*;
    view.sites = selected.*;
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, &view);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, tree, selected, positions, 1_000_000);
    defer a.free(projection);
    const defaults = try paint.fromProjection(a, projection, 1_000_000);
    defer a.free(defaults);
    if (defaults.len != selected.items.len) return error.InvalidTextSites;
    var output: std.ArrayList(paint.Span) = .empty;
    defer output.deinit(a);
    var seen: std.AutoHashMapUnmanaged(Key, void) = .empty;
    defer seen.deinit(a);
    var matched: usize = 0;
    for (selected.items, defaults, 0..) |site, fallback, index| {
        const key: Key = .{ .element = site.element_index, .start = site.start };
        if ((try seen.getOrPut(a, key)).found_existing) return error.SourceBindingMismatch;
        if (mapping.fetchRemove(.{ .element = site.element_index, .start = site.start })) |entry| {
            const before = original.sites.items[entry.value];
            if (before.end != site.end or before.empty_element != site.empty_element or before.missing_text != site.missing_text or before.anchor_boundary != site.anchor_boundary or !std.mem.eql(u8, before.text, site.text)) return error.SourceBindingMismatch;
            const range = ranges[entry.value];
            for (validated[range.start..range.end]) |span| {
                if (span.run_element != fallback.run_element) return error.SourceBindingMismatch;
                var mapped = span;
                mapped.site_index = index;
                mapped.start_unit = std.math.add(usize, fallback.start_unit, span.start_unit - span.site_start_unit) catch return error.LimitExceeded;
                mapped.end_unit = std.math.add(usize, fallback.start_unit, span.end_unit - span.site_start_unit) catch return error.LimitExceeded;
                mapped.site_start_unit = fallback.start_unit;
                try paint.append(a, &output, mapped, 1_000_000);
            }
            matched += 1;
        } else {
            if (site.text.len != 0 or fallback.start_unit != fallback.end_unit or !@import("continuation_empty_run.zig").valid(tree, original.template_element, site)) return error.SourceBindingMismatch;
            try paint.append(a, &output, fallback, 1_000_000);
        }
    }
    if (matched != original.sites.items.len) return error.SourceBindingMismatch;
    return try output.toOwnedSlice(a);
}
