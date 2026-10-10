//! Transient protected spans map into the existing sole owned style partition.
const std = @import("std");
const typed = @import("character_style_anchor_projection.zig");
const paint = @import("character_style_paint.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;

pub fn fromTyped(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, input: []const typed.Span) ![]paint.Span {
    const output = try a.alloc(paint.Span, input.len);
    errdefer a.free(output);
    var previous: ?typed.Owner = null;
    var base: usize = 0;
    var cursor: usize = 0;
    for (input, output) |span, *row| {
        if (span.range.start_unit != cursor or span.range.end_unit < span.range.start_unit) return error.InvalidTextSites;
        cursor = span.range.end_unit;
        if (previous == null or !std.meta.eql(previous.?, span.owner)) base = span.range.start_unit;
        previous = span.owner;
        var tab: ?usize = null;
        var anchor: ?usize = null;
        var site_index: usize = std.math.maxInt(usize);
        const run_index = switch (span.owner) {
            .text_site => |index| block: {
                if (index >= sites.items.len or sites.items[index].element_index >= tree.elements.len) return error.InvalidTextSites;
                site_index = index;
                const node = tree.elements[sites.items[index].element_index];
                if (!node.is(@import("document_xml.zig").paragraph_uri, if (sites.items[index].missing_text) "run" else "t")) return error.SourceBindingMismatch;
                break :block if (sites.items[index].missing_text) sites.items[index].element_index else node.parent orelse return error.SourceBindingMismatch;
            },
            .tab_element => |index| block: {
                if (span.range.end_unit - span.range.start_unit != 1) return error.InvalidTextSites;
                if (!@import("retained_inline_unit.zig").supported(tree, index)) return error.UnsupportedInlineControl;
                tab = index;
                const text = tree.elements[index].parent orelse return error.SourceBindingMismatch;
                break :block tree.elements[text].parent orelse return error.SourceBindingMismatch;
            },
            .anchor_element => |index| block: {
                if (span.range.end_unit - span.range.start_unit != 1) return error.InvalidTextSites;
                if (@import("run_anchor.zig").kind(tree, index) == null) return error.UnsupportedParagraphControl;
                anchor = index;
                break :block tree.elements[index].parent orelse return error.SourceBindingMismatch;
            },
        };
        if (run_index >= tree.elements.len or !tree.elements[run_index].is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
        row.* = .{ .start_unit = span.range.start_unit, .end_unit = span.range.end_unit, .site_start_unit = base, .site_index = site_index, .run_element = run_index, .char_shape_id = span.range.char_shape_id, .tab_element = tab, .anchor_element = anchor };
    }
    return output;
}

pub fn toTyped(a: std.mem.Allocator, input: []const paint.Span) ![]typed.Span {
    const output = try a.alloc(typed.Span, input.len);
    errdefer a.free(output);
    for (input, output) |span, *row| {
        if (span.anchor_element != null and span.tab_element != null) return error.InvalidTextSites;
        row.* = .{ .range = .{ .start_unit = span.start_unit, .end_unit = span.end_unit, .char_shape_id = span.char_shape_id }, .owner = if (span.anchor_element) |index| .{ .anchor_element = index } else if (span.tab_element) |index| .{ .tab_element = index } else .{ .text_site = span.site_index } };
    }
    return output;
}

test "HWPX protected styles use one owned paragraph model and save actual line objects" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, sites: *const Sites, source_locations: []const @import("section_text.zig").Location) !void {
            var counters: @import("section_text.zig").Report = .{};
            var values = try @import("paragraph_structure_collect.zig").collect(allocator, tree, sites, source_locations, .{}, &counters);
            defer values.deinit(allocator);
            const paragraph = &values.paragraphs[0];
            const locations = try @import("paragraph_structure_locations.zig").build(allocator, tree, paragraph);
            defer allocator.free(locations);
            const positions = try @import("anchor_paragraph_edit.zig").segments(allocator, tree, &paragraph.sites, locations, 1);
            defer allocator.free(positions);
            const original = try typed.build(allocator, tree, &paragraph.sites, positions, 1000);
            defer allocator.free(original);
            const owned = try fromTyped(allocator, tree, &paragraph.sites, original);
            paragraph.character_styles = owned;
            const roundtrip = try toTyped(allocator, owned);
            defer allocator.free(roundtrip);
            try std.testing.expectEqualDeep(original, roundtrip);
            for (owned) |*span| if (span.anchor_element != null) {
                span.char_shape_id = 9;
                try std.testing.expectEqual(std.math.maxInt(usize), span.site_index);
            };
            const output = try @import("character_style_paragraph_xml.zig").write(allocator, tree, paragraph, 4_000_000);
            defer allocator.free(output);
            var count: usize = 0;
            for (owned) |span| if (span.anchor_element) |index| {
                try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, tree.sourceOf(index)));
                count += 1;
            };
            try std.testing.expectEqual(@as(usize, 2), count);
            var cloned = try paragraph.clone(allocator);
            defer cloned.deinit(allocator);
            try std.testing.expectEqualDeep(owned, cloned.character_styles.?);
        }
    };
    try Probe.run(a, &section.tree, &section.sites, section.locations);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, &section.sites, section.locations });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    const invalid: paint.Span = .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 0, .anchor_element = 1, .tab_element = 2 };
    const gap: typed.Span = .{ .range = .{ .start_unit = 1, .end_unit = 2, .char_shape_id = 0 }, .owner = .{ .text_site = 0 } };
    try std.testing.expectError(error.InvalidTextSites, fromTyped(a, &section.tree, &section.sites, &.{gap}));
    try std.testing.expectError(error.InvalidTextSites, toTyped(a, &.{invalid}));
    try std.testing.expectError(error.UnsupportedParagraphControl, @import("character_style_tab_adapter.zig").toTyped(a, &.{invalid}));
}
