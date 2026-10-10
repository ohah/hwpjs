//! Current host provenance for source tables; no pixel layout or parent cache.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
pub const Placement = struct { table_node: usize, paragraph: usize, parent_table_node: ?usize, parent_list_node: ?usize };

pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, paragraphs: []const model.Paragraph) ![]Placement {
    if (paragraphs.len > 100000) return error.LimitExceeded;
    var tree = try Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var ordinals: std.AutoHashMapUnmanaged(usize, ?usize) = .empty;
    defer ordinals.deinit(a);
    for (paragraphs, 0..) |p, index| {
        if (p.source_node != null and p.header_template != null) return error.SourceBindingMismatch;
        const template = p.source_node orelse p.header_template orelse return error.MissingParagraphSource;
        if (template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
        const expected: ?usize = if (p.parent_node) |parent| parent else null;
        if (tree.nodes[template].parent != expected) return error.SourceBindingMismatch;
        const entry = try ordinals.getOrPut(a, template);
        entry.value_ptr.* = if (entry.found_existing) null else index;
    }
    var output: std.ArrayList(Placement) = .empty;
    defer output.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .table) continue;
        var cursor = node.parent;
        var host: ?usize = null;
        var depth: usize = 0;
        while (cursor) |ancestor| {
            if (ancestor >= tree.nodes.len or depth >= tree.nodes.len) return error.SourceBindingMismatch;
            depth += 1;
            if (tree.nodes[ancestor].record.value == .header) {
                host = ancestor;
                break;
            }
            cursor = tree.nodes[ancestor].parent;
        }
        const template = host orelse return error.MissingTablePlacementParagraph;
        const current = ordinals.get(template) orelse return error.MissingCurrentTableDisplayHost;
        const paragraph = current orelse return error.AmbiguousTableDisplayHost;
        var parent_table: ?usize = null;
        var parent_list: ?usize = null;
        if (tree.nodes[template].parent) |parent| {
            const value = tree.nodes[parent].record.value;
            if (value == .control_header and value.control_header.id == @import("../body/control_rules.zig").table_id) {
                const cell = @import("../body/formula_cell.zig").locate(tree, groups, template, .observed8) catch |err| {
                    if (err == error.FormulaInCaption) {
                        try output.append(a, .{ .table_node = index, .paragraph = paragraph, .parent_table_node = null, .parent_list_node = null });
                        continue;
                    }
                    return err;
                };
                parent_table = cell.table_node;
                parent_list = cell.list_node;
            }
        }
        try output.append(a, .{ .table_node = index, .paragraph = paragraph, .parent_table_node = parent_table, .parent_list_node = parent_list });
    }
    return output.toOwnedSlice(a);
}

test "HWP5 table placements identify actual source host and nested cell ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    const rows = try read(a, decoded, source.header.version(), document.sections[0].paragraphs);
    defer a.free(rows);
    const bindings = try @import("table_display_bindings.zig").read(a, decoded, source.header.version(), document.sections[0].paragraphs);
    defer a.free(bindings);
    var nested: usize = 0;
    for (rows) |row| {
        if (row.parent_table_node) |parent| {
            var matched = false;
            for (bindings) |binding| if (binding.paragraph == row.paragraph and binding.table_node == parent and binding.list_node == row.parent_list_node) {
                matched = true;
            };
            try std.testing.expect(matched);
            nested += 1;
        }
    }
    try std.testing.expect(nested > 0);
}

test "HWP5 table placements preserve allocation cleanup and reject ambiguous current hosts" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    const paragraphs = document.sections[0].paragraphs;
    const expected = try read(a, decoded, source.header.version(), paragraphs);
    defer a.free(expected);
    try std.testing.expect(expected.len > 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, data: []const u8, version: @import("../version.zig").Version, current: []const model.Paragraph, reference: []const Placement) !void {
            const actual = try read(allocator, data, version, current);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(reference, actual);
        }
    }.run, .{ decoded, source.header.version(), paragraphs, expected });

    const host = expected[0].paragraph;
    const original = paragraphs[host];
    defer paragraphs[host] = original;
    paragraphs[host].header_template = original.source_node;
    try std.testing.expectError(error.SourceBindingMismatch, read(a, decoded, source.header.version(), paragraphs));
    paragraphs[host].source_node = null;
    const generated = try read(a, decoded, source.header.version(), paragraphs);
    defer a.free(generated);
    try std.testing.expectEqualDeep(expected, generated);
    paragraphs[host] = original;

    const duplicate = try a.alloc(model.Paragraph, paragraphs.len + 1);
    defer a.free(duplicate);
    @memcpy(duplicate[0..paragraphs.len], paragraphs);
    duplicate[paragraphs.len] = original;
    try std.testing.expectError(error.AmbiguousTableDisplayHost, read(a, decoded, source.header.version(), duplicate));

    const missing = try a.alloc(model.Paragraph, paragraphs.len - 1);
    defer a.free(missing);
    @memcpy(missing[0..host], paragraphs[0..host]);
    @memcpy(missing[host..], paragraphs[host + 1 ..]);
    try std.testing.expectError(error.MissingCurrentTableDisplayHost, read(a, decoded, source.header.version(), missing));
}

test "HWP5 table placements session snapshot matches source and rejects invalid section" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const first = try session.tablePlacements(a, 0);
    defer a.free(first);
    const second = try session.tablePlacements(a, 0);
    defer a.free(second);
    try std.testing.expect(first.len > 0);
    try std.testing.expectEqualDeep(first, second);
    try std.testing.expect(first.ptr != second.ptr);
    try std.testing.expectError(error.InvalidSection, session.tablePlacements(a, session.sectionCount()));
}
