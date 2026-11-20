//! Native declarations only until an exact Main slot grant.
const std = @import("std");
const a = std.testing.allocator;
const Tree = @import("xml_part_tree.zig").Tree;
const selected = @import("xml_tree_selection.zig");
const Index = @import("selected_run_owner.zig").Index;
const uri = @import("document_xml.zig").paragraph_uri;
const begin = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
const end = "</s:sec>";
const field_branch = "<p:p><p:run><p:switch><p:case p:required-namespace='urn:unsupported'><x:future/></p:case><p:default><p:t>A</p:t><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>LABEL</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:default></p:switch></p:run></p:p>";
fn owners(allocator: std.mem.Allocator, tree: *const Tree) ![]?usize {
    const result = try @import("paragraph_site_owner.zig").indexAncestors(allocator, tree);
    for (tree.elements, 0..) |element, node| if (element.is(uri, "p")) {
        result[node] = node;
    };
    return result;
}
fn checkIndex(allocator: std.mem.Allocator, tree: *const Tree) !void {
    const frames = try selected.build(allocator, tree, .{ .mode = .selected }, 4096);
    defer allocator.free(frames);
    const actual = try owners(allocator, tree);
    defer allocator.free(actual);
    var index = try Index.build(allocator, tree, frames, actual, 100000, true);
    defer index.deinit(allocator);
    try std.testing.expectEqual(tree.elements.len, index.nodes);
    var text: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!frames[node].active or !element.is(uri, "t")) continue;
        const run = index.parents[node] orelse return error.MissingSelectedRun;
        try std.testing.expect(tree.elements[run].is(uri, "run"));
        try std.testing.expectEqual(actual[run], actual[node]);
        text += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), text);
}
test "document text batch delegation selected run index maps active text and fields without changing physical parents" {
    var tree = try @import("xml_part_tree.zig").parse(a, begin ++ field_branch ++ end, .section, 0, 0, .{});
    defer tree.deinit(a);
    try checkIndex(a, &tree);
    try std.testing.expectEqualStrings(begin ++ field_branch ++ end, tree.source);
    for ([_][]const u8{
        "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:switch><p:default><x:futureControl/></p:default></p:switch></p:run></p:p>",
        "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:switch><p:default>LEAK<p:t>safe</p:t></p:default></p:switch></p:run></p:p>",
        "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:switch><p:default><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>nested</p:t></p:run></p:p></p:default></p:switch></p:run></p:p>",
    }) |invalid| {
        const xml = try std.mem.concat(a, u8, &.{ begin, invalid, end });
        defer a.free(xml);
        const input = try @import("document_text_test_fixture.zig").inputWithSection(a, xml);
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        try std.testing.expectError(error.IncompleteControlTextObservation, @import("document_text_snapshot.zig").observe(a, &session, .{ .epoch = 1, .opened = true }, null));
    }
}
test "document text batch delegation selected run index OOM releases every partial allocation" {
    var tree = try @import("xml_part_tree.zig").parse(a, begin ++ field_branch ++ end, .section, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(checkIndex, .{&tree});
}
test "document text batch delegation selected index rejects mismatched bounds and parent order" {
    var tree = try @import("xml_part_tree.zig").parse(a, begin ++ field_branch ++ end, .section, 0, 0, .{});
    defer tree.deinit(a);
    const frames = try selected.build(a, &tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const actual = try owners(a, &tree);
    defer a.free(actual);
    try std.testing.expectError(error.SourceBindingMismatch, Index.build(a, &tree, frames[0 .. frames.len - 1], actual, 100000, true));
    try std.testing.expectError(error.LimitExceeded, Index.build(a, &tree, frames, actual, tree.elements.len - 1, true));
    const parent = tree.elements[1].parent;
    tree.elements[1].parent = 1;
    defer tree.elements[1].parent = parent;
    try std.testing.expectError(error.InvalidSectionTreeDepth, Index.build(a, &tree, frames, actual, 100000, true));
}
test "document text batch delegation selected index keeps nested paragraph and inline run boundaries explicit" {
    const body = "<p:p><p:run><p:switch><p:default><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:default></p:switch><p:t><p:run><p:switch><p:default><p:t>inline</p:t></p:default></p:switch></p:run></p:t></p:run></p:p>";
    var tree = try @import("xml_part_tree.zig").parse(a, begin ++ body ++ end, .section, 0, 0, .{});
    defer tree.deinit(a);
    const frames = try selected.build(a, &tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const actual = try owners(a, &tree);
    defer a.free(actual);
    var index = try Index.build(a, &tree, frames, actual, 100000, true);
    defer index.deinit(a);
    var invalid: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (index.invalid_owners[node] != null) invalid += 1;
        if (frames[node].in_text and element.is(uri, "run")) {
            try std.testing.expect(index.wrapper_runs[node] == null);
            try std.testing.expectEqual(element.parent, index.parents[node]);
        }
    }
    try std.testing.expectEqual(@as(usize, 1), invalid);
}
test "document text batch delegation conditional object keeps one original wrapper and strict edit ownership" {
    const body = "<p:p><p:run><p:switch><p:case p:required-namespace='urn:chart'><p:chart/></p:case><p:default><p:ole/></p:default></p:switch></p:run></p:p>";
    var tree = try @import("xml_part_tree.zig").parse(a, begin ++ body ++ end, .section, 0, 0, .{});
    defer tree.deinit(a);
    const frames = try selected.build(a, &tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const actual = try owners(a, &tree);
    defer a.free(actual);
    var index = try Index.build(a, &tree, frames, actual, 100000, true);
    defer index.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| if (element.is(uri, "switch")) {
        try std.testing.expectEqual(@import("run_anchor.zig").Kind.conditional_object, @import("run_anchor.zig").kind(&tree, node).?);
        try std.testing.expect(index.wrapper_runs[node] == null);
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqual(@as(usize, 0), index.rewrites);
    const nested = "<p:p><p:run><p:switch><p:default><p:switch><p:case p:required-namespace='urn:chart'><p:chart/></p:case><p:default><p:ole/></p:default></p:switch></p:default></p:switch></p:run></p:p>";
    var other = try @import("xml_part_tree.zig").parse(a, begin ++ nested ++ end, .section, 0, 0, .{});
    defer other.deinit(a);
    const other_frames = try selected.build(a, &other, .{ .mode = .selected }, 4096);
    defer a.free(other_frames);
    const other_owners = try owners(a, &other);
    defer a.free(other_owners);
    var other_index = try Index.build(a, &other, other_frames, other_owners, 100000, true);
    defer other_index.deinit(a);
    var nested_objects: usize = 0;
    for (other.elements, 0..) |element, node| if (element.is(uri, "switch") and
        @import("run_switch_anchor.zig").readShapeSupported(&other, node))
    {
        try std.testing.expect(@import("run_anchor.zig").kind(&other, node) == null);
        try std.testing.expect(!@import("run_switch_anchor.zig").supported(&other, node));
        try std.testing.expect(other_index.wrapper_runs[node] == null);
        const real_run = other_index.parents[node] orelse return error.MissingSelectedRun;
        try std.testing.expect(other.elements[real_run].is(uri, "run"));
        nested_objects += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), nested_objects);
    try std.testing.expectEqual(@as(usize, 1), other_index.rewrites);
}
test "document text batch delegation selected parent preparation visits a large sibling fixture once" {
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);
    try body.appendSlice(a, begin);
    for (0..1000) |_| try body.appendSlice(a, field_branch);
    try body.appendSlice(a, end);
    var tree = try @import("xml_part_tree.zig").parse(a, body.items, .section, 0, 0, .{});
    defer tree.deinit(a);
    const frames = try selected.build(a, &tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const actual = try owners(a, &tree);
    defer a.free(actual);
    var index = try Index.build(a, &tree, frames, actual, 100000, true);
    defer index.deinit(a);
    try std.testing.expectEqual(tree.elements.len, index.nodes);
    try std.testing.expectEqual(@as(usize, 4000), index.rewrites);
    // Also exercise the real Context on distinct current Session owners, not
    // just the isolated parent-index fixture above.
    var current_xml: std.ArrayList(u8) = .empty;
    defer current_xml.deinit(a);
    try current_xml.appendSlice(a, begin);
    for (0..1000) |ordinal| {
        const paragraph = try std.fmt.allocPrint(a, "<p:p id='{d}' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:switch><p:case p:required-namespace='urn:unsupported'><x:futureControl/></p:case><p:default><p:t>A</p:t></p:default></p:switch></p:run></p:p>", .{ordinal + 1});
        defer a.free(paragraph);
        try current_xml.appendSlice(a, paragraph);
    }
    try current_xml.appendSlice(a, end);
    const input = try @import("document_text_test_fixture.zig").inputWithSection(a, current_xml.items);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var physical = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer physical.deinit(a);
    var context = try @import("control_text_read_context.zig").Context.init(a, &section.tree, physical.paragraphs, try @import("document_text_read_options.zig").fromSession(session.options));
    defer context.deinit();
    try std.testing.expectEqual(@as(usize, 1000), context.rows.len);
    try std.testing.expectEqual(section.tree.elements.len, context.counters.nodes);
    try std.testing.expectEqual(section.tree.elements.len, context.counters.selected_parent_nodes);
    try std.testing.expectEqual(@as(usize, 1000), context.counters.selected_parent_rewrites);
    try std.testing.expectEqual(@as(usize, 1000), context.counters.binding_scans);
    try std.testing.expectEqual(@as(usize, 1), context.counters.field_passes);
    for (context.rows) |row| {
        try std.testing.expectEqual(@import("control_text_read_context.zig").Coverage.complete, row.coverage);
        try std.testing.expectEqualStrings("A", row.text.?);
    }
}

// Slow reference retains the prior indexed-attribute SSOT solely as a bounded
// parity oracle. Production selection does not replay ancestor prefixes.
fn referenceFrames(allocator: std.mem.Allocator, tree: *const Tree, policy: @import("compatibility_selection.zig").Policy) ![]selected.Frame {
    const result = try allocator.alloc(selected.Frame, tree.elements.len);
    errdefer allocator.free(result);
    result[0] = .{};
    for (tree.elements[1..], 1..) |element, index| {
        const parent_index = element.parent orelse return error.InvalidSectionTreeDepth;
        if (parent_index >= index) return error.InvalidSectionTreeDepth;
        const parent = result[parent_index];
        var frame: selected.Frame = .{ .active = parent.active, .in_text = parent.in_text or element.is(uri, "t") };
        if (tree.part_kind == .master_page and parent_index == 0) frame.active = element.is(uri, "subList");
        if (frame.active and parent.kind == .switch_element) {
            const is_case = element.is(uri, "case");
            const is_default = !is_case and element.is(uri, "default");
            if (is_case or is_default) {
                frame.kind = .branch;
                frame.active = try @import("compatibility_selection.zig").chooseTree(allocator, tree, index, is_case, 4096, policy, &result[parent_index].selected);
            }
        } else if (frame.active and (parent.kind == .run or parent.kind == .branch) and element.is(uri, "switch")) frame.kind = .switch_element;
        if (frame.active and !parent.in_text and element.is(uri, "run")) frame.kind = .run;
        result[index] = frame;
    }
    return result;
}
test "document text batch delegation streamed selection preserves indexed namespace policy and exact frames" {
    const bodies = [_][]const u8{
        field_branch,
        "<p:p><p:run><p:switch><p:case xmlns:e='http://www.idpf.org/2007/ops' e:required-namespace='urn:feature'><p:t>FIRST</p:t></p:case><p:default><p:t>FALLBACK</p:t></p:default></p:switch></p:run></p:p>",
        "<p:p><p:run><p:switch><p:case p:required-namespace=' '><p:t>SPACE</p:t></p:case><p:default><p:t>FALLBACK</p:t></p:default></p:switch></p:run></p:p>",
        "<p:p><p:run><p:switch><p:default><p:switch><p:case p:required-namespace='urn:feature'><p:t>NESTED</p:t></p:case><p:default><p:t>FALLBACK</p:t></p:default></p:switch></p:default></p:switch></p:run></p:p>",
        "<p:p><p:run><p:t><p:run><p:switch><p:default><p:t>INLINE</p:t></p:default></p:switch></p:run></p:t></p:run></p:p>",
    };
    const policies = [_]@import("compatibility_selection.zig").Policy{ .{}, .{ .mode = .selected }, .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } };
    for (bodies) |body| {
        const bytes = try std.mem.concat(a, u8, &.{ begin, body, end });
        defer a.free(bytes);
        var tree = try @import("xml_part_tree.zig").parse(a, bytes, .section, 0, 0, .{});
        defer tree.deinit(a);
        for (policies) |policy| {
            const expected = try referenceFrames(a, &tree, policy);
            defer a.free(expected);
            const actual = try selected.build(a, &tree, policy, 4096);
            defer a.free(actual);
            try std.testing.expectEqual(expected.len, actual.len);
            for (expected, actual) |before, after| try std.testing.expectEqualDeep(before, after);
        }
    }
}
