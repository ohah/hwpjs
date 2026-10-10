//! Transient provenance for protected-object formatting, not an installed model.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Owner = union(enum) { text_site: usize, tab_element: usize, anchor_element: usize };
pub const Span = struct {
    range: @import("character_style_display_ranges.zig").Range,
    owner: Owner,
};

pub fn build(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, segments: []const Segment, limit: usize) ![]Span {
    for (segments) |segment| switch (segment.kind) {
        .text => {
            if (segment.index >= sites.items.len or segment.end_unit < segment.start_unit) return error.InvalidTextSites;
            if (try @import("text_site_edit.zig").utf16Length(sites.items[segment.index].text) != segment.end_unit - segment.start_unit) return error.InvalidTextSites;
        },
        .tab, .nb_space, .fw_space, .line_break, .hypen => {
            try @import("paragraph_text_positions.zig").validateInlineUnit(tree, segment);
        },
        .anchor => {
            if (segment.end_unit < segment.start_unit or segment.end_unit - segment.start_unit != 1) return error.InvalidTextSites;
            if (@import("run_anchor.zig").kind(tree, segment.index) == null) return error.UnsupportedParagraphControl;
        },
    };
    const ranges = try @import("character_style_display_ranges.zig").build(a, tree, sites, segments, limit);
    defer a.free(ranges);
    const spans = try a.alloc(Span, ranges.len);
    errdefer a.free(spans);
    var owners: std.AutoHashMap(Owner, void) = .init(a);
    defer owners.deinit();
    for (spans, ranges, segments) |*span, range, segment| span.* = .{
        .range = range,
        .owner = switch (segment.kind) {
            .text => .{ .text_site = segment.index },
            .tab, .nb_space, .fw_space, .line_break, .hypen => .{ .tab_element = segment.index },
            .anchor => .{ .anchor_element = segment.index },
        },
    };
    for (spans) |span| {
        const entry = try owners.getOrPut(span.owner);
        if (entry.found_existing) return error.SourceBindingMismatch;
    }
    return spans;
}

test "HWPX protected style provenance binds actual objects and rejects forged anchors" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const segments = try @import("anchor_paragraph_edit.zig").segments(a, &section.tree, &section.sites, section.locations, 1);
    defer a.free(segments);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, sites: *const Sites, input: []const Segment) !void {
            const spans = try build(allocator, tree, sites, input, 1000);
            defer allocator.free(spans);
            var anchors: usize = 0;
            for (spans) |span| switch (span.owner) {
                .anchor_element => |index| {
                    try std.testing.expect(@import("run_anchor.zig").kind(tree, index) != null);
                    try std.testing.expectEqual(@as(usize, 1), span.range.end_unit - span.range.start_unit);
                    anchors += 1;
                },
                else => {},
            };
            try std.testing.expectEqual(@as(usize, 2), anchors);
        }
    };
    try Probe.run(a, &section.tree, &section.sites, segments);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, &section.sites, segments });
    var forged = segments[0];
    forged.kind = .anchor;
    forged.index = section.tree.elements.len;
    forged.start_unit = 0;
    forged.end_unit = 1;
    try std.testing.expectError(error.UnsupportedParagraphControl, build(a, &section.tree, &section.sites, &.{forged}, 1000));
    forged.end_unit = 2;
    try std.testing.expectError(error.InvalidTextSites, build(a, &section.tree, &section.sites, &.{forged}, 1000));
    var duplicate: [2]Segment = undefined;
    for (segments) |segment| if (segment.kind == .anchor) {
        duplicate[0] = segment;
        duplicate[0].start_unit = 0;
        duplicate[0].end_unit = 1;
        duplicate[1] = duplicate[0];
        duplicate[1].start_unit = 1;
        duplicate[1].end_unit = 2;
        break;
    };
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &section.tree, &section.sites, &duplicate, 1000));
    try std.testing.expectError(error.LimitExceeded, build(a, &section.tree, &section.sites, segments, 1));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
