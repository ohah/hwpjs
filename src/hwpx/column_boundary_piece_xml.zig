//! Emit one piece's current runs; source ownership is supplied explicitly.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn appendRuns(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, owns_source: bool, options: @import("text_sites.zig").Options, output: *std.ArrayList(u8), limit: usize) !void {
    return appendSelected(a, tree, paragraph, owns_source, null, options, output, limit);
}

pub fn appendSelected(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, owns_source: bool, owned: ?[]const @import("column_boundary_position.zig").Position, options: @import("text_sites.zig").Options, output: *std.ArrayList(u8), limit: usize) !void {
    return appendMode(a, tree, paragraph, owns_source, owned, options, output, limit, false);
}

pub fn appendSelectedWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, owns_source: bool, owned: ?[]const @import("column_boundary_position.zig").Position, options: @import("text_sites.zig").Options, output: *std.ArrayList(u8), limit: usize) !void {
    return appendMode(a, tree, paragraph, owns_source, owned, options, output, limit, true);
}

fn appendMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, owns_source: bool, owned: ?[]const @import("column_boundary_position.zig").Position, options: @import("text_sites.zig").Options, output: *std.ArrayList(u8), limit: usize, allow_tabs: bool) !void {
    if (paragraph.template_element >= tree.elements.len) return error.SourceBindingMismatch;
    const node = tree.elements[paragraph.template_element];
    if (!node.is(uri, "p") or node.end_tag == null) return error.InvalidParagraphElement;
    if (owns_source) try @import("column_boundary_joined_metadata.zig").validateRight(tree, paragraph.template_element);
    var child = node.first_child;
    var cursor = node.start_tag.end;
    while (child) |index| {
        const element = tree.elements[index];
        try append(a, output, tree.source[cursor..element.start_tag.start], limit);
        if (element.is(uri, "run")) {
            var selected_styles: ?[]const @import("character_style_paint.zig").Span = null;
            if (paragraph.character_styles) |styles| {
                var first: ?usize = null;
                var last: usize = 0;
                for (styles, 0..) |span, ordinal| if (span.run_element == index) {
                    if (first == null) first = ordinal;
                    last = ordinal + 1;
                };
                if (first) |start| selected_styles = styles[start..last];
            }
            const run = if (selected_styles) |styles|
                try @import("character_style_run_closed.zig").write(a, tree, &paragraph.sites, styles, limit -| output.items.len)
            else if (allow_tabs)
                try @import("run_current_xml.zig").writeWithTabs(a, tree, paragraph, index, options, limit -| output.items.len, !owns_source)
            else
                try @import("run_current_xml.zig").writeMode(a, tree, paragraph, index, options, limit -| output.items.len, !owns_source);
            defer a.free(run);
            const continuation = if (selected_styles != null and !owns_source) try @import("styled_continuation_xml.zig").runs(a, run, limit -| output.items.len) else null;
            defer if (continuation) |bytes| a.free(bytes);
            const filtered = if (owned) |boundaries| try @import("column_boundary_run_filter.zig").write(a, tree, index, run, boundaries, limit -| output.items.len) else null;
            defer if (filtered) |bytes| a.free(bytes);
            try append(a, output, filtered orelse continuation orelse run, limit);
        }
        cursor = element.end;
        child = element.next_sibling;
    }
    try append(a, output, tree.source[cursor..node.end_tag.?.start], limit);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}

test "column piece XML preserves empty styled runs and cleans allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
    for ([_]bool{ false, true }) |owner| {
        const Probe = struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Paragraph, owns_source: bool) !void {
                var output: std.ArrayList(u8) = .empty;
                defer output.deinit(allocator);
                try appendRuns(allocator, parsed, current, owns_source, .{}, &output, 10000);
                try std.testing.expect(std.mem.indexOf(u8, output.items, "charPrIDRef") != null);
                try std.testing.expect(std.mem.indexOf(u8, output.items, "p:t") != null);
            }
        };
        try Probe.run(a, &tree, &paragraph, owner);
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &paragraph, owner });
    }
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    try std.testing.expectError(error.LimitExceeded, appendRuns(a, &tree, &paragraph, true, .{}, &output, 1));
    try std.testing.expectEqualStrings(source, tree.source);
}
