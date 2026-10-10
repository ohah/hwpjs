const std = @import("std");

test "paragraph template-only role rejects source owners and text while preserving clones" {
    const a = std.testing.allocator;
    const model = @import("paragraph_joined_values.zig");
    var pieces = [_]model.Piece{.{ .template_element = 1, .source_ordinal = null, .generated_id = 7, .first_site = 0, .site_count = 0, .owns_source = false, .template_only = true }};
    const joined: model.Joined = .{ .pieces = &pieces, .sites = .{ .items = &.{} } };
    try joined.validate();
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, value: *const model.Joined) !void {
            var copy = try value.clone(allocator);
            defer copy.deinit(allocator);
            try std.testing.expect(copy.pieces[0].template_only);
            try std.testing.expectEqualDeep(value.pieces, copy.pieces);
            const bytes = try copy.byteSize(10000);
            try std.testing.expectError(error.LimitExceeded, copy.byteSize(bytes - 1));
        }
    };
    try Probe.run(a, &joined);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&joined});
    pieces[0].owns_source = true;
    try std.testing.expectError(error.SourceBindingMismatch, joined.validate());
    pieces[0].owns_source = false;
    pieces[0].site_count = 1;
    var sites = [_]@import("text_sites.zig").Site{.{ .element_index = 2, .start = 0, .end = 1, .text = @constCast("X") }};
    const nonempty: model.Joined = .{ .pieces = &pieces, .sites = .{ .items = &sites } };
    try std.testing.expectError(error.NonEmptyProvenancePiece, nonempty.validate());
}

test "paragraph piece output roles fold emitted continuation into inventory owner" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const left = session.sections[0].structure_values.?.paragraphs[0].joined().?;
    const right = session.sections[0].structure_values.?.paragraphs[1].joined().?;
    left.pieces[1].output = .inventory_only;
    right.pieces[1].output = .source_runs;
    const pieces = try std.mem.concat(a, @import("paragraph_joined_values.zig").Piece, &.{ left.pieces, right.pieces });
    defer a.free(pieces);
    for (pieces[left.pieces.len..]) |*piece| piece.first_site += left.sites.items.len;
    const sites = try std.mem.concat(a, @import("text_sites.zig").Site, &.{ left.sites.items, right.sites.items });
    defer a.free(sites);
    const borrowed: @import("paragraph_joined_values.zig").Joined = .{ .pieces = pieces, .sites = .{ .items = sites } };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, current: *const @import("paragraph_joined_values.zig").Joined) !void {
            var folded = (try @import("paragraph_joined_fold.zig").prepare(allocator, current, 2, 10000)).?;
            defer folded.deinit(allocator);
            try folded.validate();
            try std.testing.expectEqual(@as(@TypeOf(folded.pieces[1].output), .current_runs), folded.pieces[1].output);
            try std.testing.expectEqualStrings("B", folded.sites.items[1].text);
            try std.testing.expectEqual(@as(@TypeOf(current.pieces[1].output), .inventory_only), current.pieces[1].output);
        }
    };
    try Probe.run(a, &borrowed);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&borrowed});
}

test "paragraph piece output roles preserve bindings clone budget and split" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const paragraph = &session.sections[0].structure_values.?.paragraphs[0];
    const pieces = paragraph.pieces.?;
    const site = &paragraph.sites.items[pieces[1].first_site];
    a.free(site.text);
    site.text = try a.dupe(u8, "");
    pieces[1].output = .inventory_only;
    const joined = paragraph.joined().?;
    try joined.validate();
    try std.testing.expect(pieces[1].owns_source);
    const tree = &session.sections[0].tree;
    const positions = try @import("paragraph_joined_positions.zig").build(a, tree, &joined);
    defer a.free(positions);
    try std.testing.expectEqual(@as(usize, 1), positions.len);
    var copy = try joined.clone(a);
    defer copy.deinit(a);
    try std.testing.expectEqualDeep(joined.pieces, copy.pieces);
    const bytes = try joined.byteSize(10000);
    try std.testing.expectEqual(bytes, try copy.byteSize(bytes));
    try std.testing.expectError(error.LimitExceeded, copy.byteSize(bytes - 1));
    var split = try @import("paragraph_joined_split.zig").prepare(a, tree, &joined, 1, 1, 10000);
    defer split.deinit(a);
    try std.testing.expectEqualDeep(joined.pieces, split.left.pieces);
    try std.testing.expectEqualDeep(joined.pieces, split.right.pieces);
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_joined_xml.zig").write(a, tree, &joined, .{}, 10000));
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, current: *const @import("paragraph_joined_values.zig").Joined) !void {
            var cloned = try current.clone(allocator);
            defer cloned.deinit(allocator);
            try std.testing.expectEqualDeep(current.pieces, cloned.pieces);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&joined});
    copy.pieces[1].output = .current_runs;
    try std.testing.expectEqual(@as(@TypeOf(pieces[1].output), .inventory_only), pieces[1].output);
    a.free(copy.sites.items[1].text);
    copy.sites.items[1].text = try a.dupe(u8, "bad");
    copy.pieces[1].output = .inventory_only;
    try std.testing.expectError(error.NonEmptyProvenancePiece, copy.validate());
    copy.pieces[0].output = .inventory_only;
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, copy.validate());
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 1_000_000);
    defer checkpoint.deinit();
    pieces[1].output = .current_runs;
    try checkpoint.exchange(&session);
    try std.testing.expectEqual(@as(@TypeOf(pieces[1].output), .inventory_only), session.sections[0].structure_values.?.paragraphs[0].pieces.?[1].output);
    try checkpoint.exchange(&session);
    try std.testing.expectEqual(@as(@TypeOf(pieces[1].output), .current_runs), session.sections[0].structure_values.?.paragraphs[0].pieces.?[1].output);
}

test "paragraph piece output roles exclude real source runs but retain column inventory" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        try std.testing.expect(try session.mergeParagraph(0, 1));
        try std.testing.expect(try session.mergeParagraph(0, 1));
        try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
        var current = try session.sections[0].structure_values.?.clone(a);
        defer current.deinit(a);
        const paragraph = &current.paragraphs[0];
        const tree = &session.sections[0].tree;
        const before = try @import("column_boundary_joined_xml.zig").writeBase(a, tree, paragraph, .{}, 1_000_000);
        defer a.free(before);
        try std.testing.expectEqual(@as(usize, 3), paragraph.pieces.?.len);
        paragraph.pieces.?[2].output = .inventory_only;
        const joined = paragraph.joined().?;
        try joined.validate();
        const inventory = try @import("column_boundary_joined_collect.zig").collect(a, tree, &joined, 100);
        defer a.free(inventory);
        try std.testing.expectEqual(@as(usize, 3), inventory.len);
        try std.testing.expect(paragraph.pieces.?[2].owns_source);
        const after = try @import("column_boundary_joined_xml.zig").writeBase(a, tree, paragraph, .{}, 1_000_000);
        defer a.free(after);
        const root = tree.elements[0];
        const ending = root.end_tag.?;
        const Counter = struct {
            fn runs(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, fragment: []const u8, start: @TypeOf(root.start_tag), end: @TypeOf(ending)) !usize {
                const wrapper = try std.mem.concat(allocator, u8, &.{ parsed.source[start.start..start.end], fragment, parsed.source[end.start..end.end] });
                defer allocator.free(wrapper);
                var result = try @import("xml_part_tree.zig").parse(allocator, wrapper, .section, 0, 0, .{});
                defer result.deinit(allocator);
                var count: usize = 0;
                for (result.elements) |element| if (element.is(@import("document_xml.zig").paragraph_uri, "run")) {
                    count += 1;
                };
                return count;
            }
        };
        var removed_runs: usize = 0;
        var child = tree.elements[paragraph.pieces.?[2].template_element].first_child;
        while (child) |index| : (child = tree.elements[index].next_sibling) {
            if (tree.elements[index].is(@import("document_xml.zig").paragraph_uri, "run")) removed_runs += 1;
        }
        try std.testing.expectEqual(try Counter.runs(a, tree, before, root.start_tag, ending), (try Counter.runs(a, tree, after, root.start_tag, ending)) + removed_runs);
        const group = try @import("column_boundary_group_xml.zig").write(a, tree, current.paragraphs, .{}, 1_000_000);
        defer a.free(group);
        try std.testing.expect(std.mem.indexOf(u8, group, "colCount=\"3\"") != null);
        try std.testing.expect(std.mem.startsWith(u8, group, after));
        var baseline = try @import("editor_session.zig").open(a, input, .{});
        defer baseline.deinit();
        try std.testing.expect(try baseline.mergeParagraph(0, 1));
        try std.testing.expect(try baseline.splitParagraph(0, 1, 1, 0));
        const baseline_left = try @import("column_boundary_joined_xml.zig").writeBase(a, &baseline.sections[0].tree, &baseline.sections[0].structure_values.?.paragraphs[0], .{}, 1_000_000);
        defer a.free(baseline_left);
        try std.testing.expectEqualStrings(baseline_left, after);
    }
}

test "paragraph piece inventory group serialization cleans every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var pair = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000);
    defer pair.deinit(a);
    var whole = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &pair, 0, 10000);
    defer whole.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &whole, 0, 1, 1, 4, 10000);
    defer split.deinit(a);
    split.paragraphs[0].pieces.?[2].output = .inventory_only;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: []const @import("paragraph_structure_values.zig").Paragraph) !void {
            const output = try @import("column_boundary_group_xml.zig").write(allocator, parsed, current, .{}, 10000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "colCount='3'") != null);
        }
    };
    try Probe.run(a, &tree, split.paragraphs);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, split.paragraphs });
    try std.testing.expectEqualStrings("A", split.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqual(@as(@TypeOf(split.paragraphs[0].pieces.?[2].output), .inventory_only), split.paragraphs[0].pieces.?[2].output);
}
