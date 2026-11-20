//! Focused synthetic Native cases. Declared source only until Main grants a run.
const std = @import("std");
const a = std.testing.allocator;
const kernel = @import("hwpx/control_text_read_context.zig");
const Tree = @import("hwpx/xml_part_tree.zig").Tree;
const Paragraph = @import("hwpx/paragraph_structure_values.zig").Paragraph;
const begin = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const end = "</s:sec>";
const Fixture = struct {
    tree: Tree,
    values: @import("hwpx/paragraph_structure_values.zig").Values,
    fn init(allocator: std.mem.Allocator, xml: []const u8) !Fixture {
        var tree = try @import("hwpx/xml_part_tree.zig").parse(allocator, xml, .section, 0, 0, .{});
        errdefer tree.deinit(allocator);
        var sites = try @import("hwpx/text_sites.zig").collect(allocator, &tree, .{});
        defer sites.deinit(allocator);
        const locations = try @import("hwpx/text_site_locations.zig").build(allocator, &tree, &sites, .{});
        defer allocator.free(locations);
        var report: @import("hwpx/section_text.zig").Report = .{};
        return .{ .tree = tree, .values = try @import("hwpx/paragraph_structure_collect.zig").collect(allocator, &tree, &sites, locations, .{}, &report) };
    }
    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        self.values.deinit(allocator);
        self.tree.deinit(allocator);
    }
};
test "control text batch Native known units literal FFFC and UTF16 boundaries" {
    const xml = begin ++ "<p:p><p:run><p:t>A😀</p:t><p:equation><p:script>x+y</p:script></p:equation><p:t>￼<p:lineBreak/><p:tab/><p:nbSpace/><p:fwSpace/><p:hypen/>B</p:t></p:run></p:p>" ++ end;
    var f = try Fixture.init(a, xml);
    defer f.deinit(a);
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    const owner = f.values.paragraphs[0].template_element;
    const row = try context.rowByIndex(0, owner);
    try std.testing.expectEqual(kernel.Coverage.complete, row.coverage);
    try std.testing.expectEqualStrings("A😀￼B", row.plain);
    try std.testing.expectEqualStrings("A😀￼￼\n\t\u{a0}\u{2007}\u{ad}B", row.text.?);
    try std.testing.expectEqual(@as(u32, 3), row.controls[0].startUnit);
    try std.testing.expectEqual(@as(usize, 6), row.controls.len);
    try context.validateBoundary(0, owner, 3);
    try std.testing.expectError(error.SplitSurrogatePair, context.validateBoundary(0, owner, 2));
    try std.testing.expectEqualStrings(xml, f.tree.source);
}
test "control text batch Native nested and runless owners stay separate" {
    const xml = begin ++ "<p:p><p:run><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:pic/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:t>OUT</p:t></p:run></p:p><p:p/>" ++ end;
    var f = try Fixture.init(a, xml);
    defer f.deinit(a);
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    try std.testing.expectEqual(@as(usize, 3), context.rows.len);
    try std.testing.expectEqualStrings("￼OUT", context.rows[0].text.?);
    try std.testing.expectEqualStrings("￼", context.rows[1].text.?);
    try std.testing.expectEqualStrings("", context.rows[2].text.?);
    try std.testing.expect(context.rows[0].sourceNode != context.rows[1].sourceNode);
    try std.testing.expectError(error.SourceBindingMismatch, context.rowByIndex(0, context.rows[1].sourceNode));
}
test "control text batch Native known field read does not need write eligibility and unknown stays partial" {
    const xml = begin ++ "<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>LABEL</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p><p:p><p:run><p:t>SAFE</p:t><p:futureControl/></p:run></p:p>" ++ end;
    var f = try Fixture.init(a, xml);
    defer f.deinit(a);
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    try std.testing.expectEqualStrings("LABEL", context.rows[0].text.?);
    try std.testing.expectEqual(kernel.Coverage.partial, context.rows[1].coverage);
    try std.testing.expect(context.rows[1].text == null);
    try std.testing.expectEqualStrings("SAFE", context.rows[1].plain);
    try std.testing.expectError(error.IncompleteControlTextObservation, context.copyVisibleText(a, 1, context.rows[1].sourceNode, 1000));
    try std.testing.expectEqual(@as(usize, 1), context.counters.field_passes);
}
test "control text batch Native actual current site edits remain authoritative without materialize" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t>A<p:lineBreak/>B</p:t></p:run></p:p>" ++ end);
    defer f.deinit(a);
    _ = try @import("hwpx/text_site_edit.zig").splice(a, &f.values.paragraphs[0].sites, 0, 0, 1, "NEW😀", 1000);
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    try std.testing.expectEqualStrings("NEW😀\nB", context.rows[0].text.?);
    try std.testing.expectEqualStrings("NEW😀B", context.rows[0].plain);
}
test "control text batch Native identical start bindings are consumed exactly once" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t/></p:run></p:p>" ++ end);
    defer f.deinit(a);
    const rows = try a.alloc(Paragraph, 1000);
    defer a.free(rows);
    for (rows, 0..) |*row, index| {
        row.* = f.values.paragraphs[0];
        row.generated_id = @intCast(index + 1);
        row.source_ordinal = null;
    }
    var context = try kernel.Context.init(a, &f.tree, rows, .{});
    defer context.deinit();
    try std.testing.expectEqual(@as(usize, 1000), context.rows.len);
    try std.testing.expectEqual(@as(usize, 1000), context.counters.binding_scans);
    try std.testing.expectEqual(@as(usize, 1000), context.counters.bindings);
    try std.testing.expect(context.counters.point_lookups <= 8 * context.counters.events);
    try std.testing.expectEqual(@as(usize, 0), context.counters.control_routes);
    try std.testing.expectError(error.AmbiguousCurrentParagraphReference, context.uniqueRowByOwner(rows[0].template_element));
}
test "control text batch Native inherited control routes are bounded by true output" {
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, begin ++ "<p:p><p:run><p:t/>");
    for (0..64) |_| try xml.appendSlice(a, "<p:pic/>");
    try xml.appendSlice(a, "</p:run></p:p>" ++ end);
    var f = try Fixture.init(a, xml.items);
    defer f.deinit(a);
    const rows = try a.alloc(Paragraph, 128);
    defer a.free(rows);
    for (rows) |*row| row.* = f.values.paragraphs[0];
    var context = try kernel.Context.init(a, &f.tree, rows, .{});
    defer context.deinit();
    try std.testing.expectEqual(@as(usize, 128 * 64), context.counters.control_routes);
    try std.testing.expectEqual(context.counters.control_routes, context.counters.controls);
    for (context.rows) |row| try std.testing.expectEqual(@as(usize, 64), row.controls.len);
}
test "control text batch Native same owner many pieces partial output cannot fan out" {
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, begin ++ "<p:p><p:run><p:t/>");
    for (0..64) |_| try xml.appendSlice(a, "<p:pic/>");
    try xml.appendSlice(a, "<p:futureControl/></p:run></p:p>" ++ end);
    var f = try Fixture.init(a, xml.items);
    defer f.deinit(a);
    const sites = try a.alloc(@import("hwpx/text_sites.zig").Site, 512);
    defer a.free(sites);
    const pieces = try a.alloc(@import("hwpx/paragraph_joined_values.zig").Piece, 512);
    defer a.free(pieces);
    for (sites, pieces, 0..) |*site, *piece, index| {
        site.* = f.values.paragraphs[0].sites.items[0];
        piece.* = .{ .template_element = f.values.paragraphs[0].template_element, .source_ordinal = if (index == 0) 1 else null, .generated_id = if (index == 0) null else @as(u32, @intCast(index + 1)), .first_site = index, .site_count = 1, .owns_source = index == 0 };
    }
    var row = f.values.paragraphs[0];
    row.sites = .{ .items = sites };
    row.pieces = pieces;
    var context = try kernel.Context.init(a, &f.tree, &.{row}, .{});
    defer context.deinit();
    try std.testing.expectEqual(kernel.Coverage.partial, context.rows[0].coverage);
    try std.testing.expectEqual(@as(usize, 0), context.counters.control_routes);
    try std.testing.expectEqual(@as(usize, 512), context.counters.binding_scans);
}
test "control text batch Native allocation failure read leaves original owner bytes" {
    const xml = begin ++ "<p:p><p:run><p:t>A😀<p:tab/>B</p:t><p:equation/></p:run></p:p>" ++ end;
    var f = try Fixture.init(a, xml);
    defer f.deinit(a);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph) !void {
            var context = try kernel.Context.init(allocator, tree, rows, .{});
            defer context.deinit();
            const copy = try context.copyVisibleText(allocator, 0, rows[0].template_element, 1000);
            defer allocator.free(copy);
            try std.testing.expectEqualStrings("A😀\tB￼", copy);
        }
    }.run, .{ &f.tree, @as([]const Paragraph, f.values.paragraphs) });
    try std.testing.expectEqualStrings(xml, f.tree.source);
}

test "control text batch Native source run pieces use current Sites not lexical text" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t>OLD</p:t></p:run></p:p>" ++ end);
    defer f.deinit(a);
    const row = &f.values.paragraphs[0];
    _ = try @import("hwpx/text_site_edit.zig").splice(a, &row.sites, 0, 0, 3, "CURRENT😀", 1000);
    var pieces = [_]@import("hwpx/paragraph_joined_values.zig").Piece{.{ .template_element = row.template_element, .source_ordinal = null, .generated_id = 17, .first_site = 0, .site_count = row.sites.items.len, .owns_source = false, .output = .source_runs }};
    var view = row.*;
    view.pieces = &pieces;
    view.generated_id = 17;
    view.source_ordinal = null;
    var context = try kernel.Context.init(a, &f.tree, &.{view}, .{});
    defer context.deinit();
    try std.testing.expectEqualStrings("CURRENT😀", context.rows[0].text.?);
    try std.testing.expectEqualStrings("CURRENT😀", context.rows[0].plain);
    try std.testing.expectError(error.SplitSurrogatePair, context.validateBoundary(0, view.template_element, 8));
}

test "control text batch Native budgets reject binding part and control expansion before allocation" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t>X</p:t><p:pic/></p:run></p:p>" ++ end);
    defer f.deinit(a);
    for ([_]kernel.Limits{ .{ .max_parts = 0 }, .{ .max_bindings = 0 }, .{ .max_control_routes = 0 }, .{ .max_bytes = 1 } }) |limits| {
        try std.testing.expectError(error.LimitExceeded, kernel.Context.init(a, &f.tree, f.values.paragraphs, limits));
    }
}

test "control text batch Native missing field type remains partial and empty boundary stays exact" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p><p:p/>" ++ end);
    defer f.deinit(a);
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    try std.testing.expectEqual(kernel.Issue.UnresolvedField, context.rows[0].issue.?);
    try std.testing.expectEqualStrings("A", context.rows[0].plain);
    try context.validateBoundary(1, context.rows[1].sourceNode, 0);
    try std.testing.expectError(error.InvalidTextPosition, context.validateBoundary(1, context.rows[1].sourceNode, 1));
}

test "control text batch Native shared owner index matches nearest ancestor without paragraph scans" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t>OUT</p:t><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>IN</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p>" ++ end);
    defer f.deinit(a);
    const owners = try @import("hwpx/paragraph_site_owner.zig").indexAncestors(a, &f.tree);
    defer a.free(owners);
    for (f.tree.elements, 0..) |_, node| try std.testing.expectEqual(try @import("hwpx/paragraph_site_owner.zig").optionalAncestor(&f.tree, node), owners[node]);
}

test "control text batch Native exact content source span cannot be replaced by a tag boundary" {
    var f = try Fixture.init(a, begin ++ "<p:p><p:run><p:t>ABC</p:t></p:run></p:p>" ++ end);
    defer f.deinit(a);
    const site = &f.values.paragraphs[0].sites.items[0];
    site.end -= 1;
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, .{});
    defer context.deinit();
    try std.testing.expectEqual(kernel.Coverage.partial, context.rows[0].coverage);
    try std.testing.expectEqual(kernel.Issue.MissingCurrentSite, context.rows[0].issue.?);
    try std.testing.expectEqualStrings("ABC", context.rows[0].plain);
    try std.testing.expect(context.rows[0].text == null);
}

// The regular root includes all three paragraph-coverage tests, even when the
// focused command selects their exact names alongside the original thirteen.
comptime {
    _ = @import("control_text_read_paragraph_coverage_probe.zig");
}
