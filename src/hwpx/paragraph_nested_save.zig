//! Fold current nested paragraph values into a parent's transient replacement.
//! No rendered XML is installed in the editable model.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");
const writer = @import("xml_source_writer.zig");
const sourceOffset = @import("paragraph_nested_source.zig").offset;

pub fn fold(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, parent: usize, rendered: []const u8, limit: usize) ![]u8 {
    return foldOptions(a, tree, current, original, parent, rendered, .{}, limit);
}

pub fn foldOptions(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, parent: usize, rendered: []const u8, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return foldDepth(a, tree, current, original, parent, rendered, limit, 0, null, null, false, options);
}

pub fn foldContinuation(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, parent: usize, rendered: []const u8, limit: usize) ![]u8 {
    return foldContinuationOptions(a, tree, current, original, parent, rendered, .{}, limit);
}

pub fn foldContinuationOptions(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, parent: usize, rendered: []const u8, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return foldDepth(a, tree, current, original, parent, rendered, limit, 0, null, null, true, options);
}

pub fn foldJoined(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, joined: *const @import("paragraph_joined_values.zig").Joined, rendered: []const u8, limit: usize) ![]u8 {
    return foldJoinedOptions(a, tree, current, original, joined, rendered, .{}, limit);
}

pub fn foldJoinedOptions(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, joined: *const @import("paragraph_joined_values.zig").Joined, rendered: []const u8, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try joined.validate();
    return foldDepth(a, tree, current, original, joined.pieces[0].template_element, rendered, limit, 0, joined, null, false, options);
}

pub fn foldOwnedJoined(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, joined: *const @import("paragraph_joined_values.zig").Joined, owned: []const model.ProtectedPosition, rendered: []const u8, limit: usize) ![]u8 {
    return foldOwnedJoinedOptions(a, tree, current, original, joined, owned, rendered, .{}, limit);
}

pub fn foldOwnedJoinedOptions(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, joined: *const @import("paragraph_joined_values.zig").Joined, owned: []const model.ProtectedPosition, rendered: []const u8, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    const positions = try @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, joined, owned);
    defer a.free(positions);
    return foldDepth(a, tree, current, original, joined.pieces[0].template_element, rendered, limit, 0, joined, owned, false, options);
}

test "HWPX joined nested save binds duplicate child XML to each original host" {
    const a = std.testing.allocator;
    const child = "<p:p><p:run><p:t>same</p:t></p:run></p:p>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A</p:t><p:rect><p:subList>" ++ child ++ "</p:subList></p:rect></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t><p:rect><p:subList>" ++ child ++ "</p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), original.paragraphs.len);
    var current = try original.clone(a);
    defer current.deinit(a);
    _ = try @import("text_site_edit.zig").splice(a, &current.paragraphs[1].sites, 0, 0, 0, "왼쪽😀", 10000);
    _ = try @import("text_site_edit.zig").splice(a, &current.paragraphs[3].sites, 0, 0, 0, "오른쪽😀", 10000);
    var left = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &original.paragraphs[0]);
    defer left.deinit(a);
    var right = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &original.paragraphs[2]);
    defer right.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &left, &right, 10000);
    defer joined.deinit(a);
    const positions = try @import("paragraph_joined_positions.zig").buildWithAnchors(a, &tree, &joined);
    defer a.free(positions);
    const owned = try @import("paragraph_protected_positions.zig").side(a, positions, 0, 0, true);
    defer a.free(owned);
    // 객체 경계의 귀속 계획과 공개 분할 지원을 구분해서 검증합니다.
    var partition = try @import("paragraph_joined_tab_split_plan.zig").fromPositions(a, &joined, positions, 2, 2);
    defer partition.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), partition.left.len);
    try std.testing.expectEqual(@as(usize, 1), partition.right.len);
    try std.testing.expectEqual(.anchor, partition.left[0].kind);
    try std.testing.expectEqual(.anchor, partition.right[0].kind);
    try std.testing.expectEqual(@as(u32, 1), partition.left[0].unit);
    try std.testing.expectEqual(@as(u32, 1), partition.right[0].unit);
    try std.testing.expect(partition.left[0].element_index != partition.right[0].element_index);
    var split_draft = try @import("paragraph_joined_tab_split.zig").prepareOwned(a, &tree, &joined, owned, 2, 2, 10000);
    defer split_draft.deinit(a);
    try std.testing.expectEqualSlices(model.ProtectedPosition, partition.left, split_draft.tabs.left);
    try std.testing.expectEqualSlices(model.ProtectedPosition, partition.right, split_draft.tabs.right);
    const nested_source = @import("paragraph_nested_source.zig");
    const left_object = tree.sourceOf(partition.left[0].element_index);
    const right_object = tree.sourceOf(partition.right[0].element_index);
    _ = try nested_source.offsetOwned(&tree, partition.left, original.paragraphs[1].template_element, left_object);
    _ = try nested_source.offsetOwned(&tree, partition.right, original.paragraphs[3].template_element, right_object);
    try std.testing.expectError(error.SourceBindingMismatch, nested_source.offsetOwned(&tree, partition.left, original.paragraphs[3].template_element, left_object));
    try std.testing.expectError(error.SourceBindingMismatch, nested_source.offsetOwned(&tree, partition.right, original.paragraphs[1].template_element, right_object));
    try std.testing.expectError(error.SourceBindingMismatch, nested_source.offsetOwned(&tree, partition.left, original.paragraphs[1].template_element, ""));
    const repeated_object = try std.mem.concat(a, u8, &.{ left_object, left_object });
    defer a.free(repeated_object);
    try std.testing.expectError(error.SourceBindingMismatch, nested_source.offsetOwned(&tree, partition.left, original.paragraphs[1].template_element, repeated_object));
    const rendered = try @import("paragraph_joined_xml.zig").writeOwnedAnchors(a, &tree, &joined, .{}, 10000, owned);
    defer a.free(rendered);
    const first_offset = try @import("paragraph_nested_source.zig").offsetJoined(&tree, &joined, original.paragraphs[1].template_element, rendered);
    const second_offset = try @import("paragraph_nested_source.zig").offsetJoined(&tree, &joined, original.paragraphs[3].template_element, rendered);
    try std.testing.expect(first_offset < second_offset);
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_nested_source.zig").offsetJoined(&tree, &joined, original.paragraphs[1].template_element, child));
    const extra = try std.mem.concat(a, u8, &.{ rendered, child });
    defer a.free(extra);
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_nested_source.zig").offsetJoined(&tree, &joined, original.paragraphs[1].template_element, extra));
    var paragraphs = [_]model.Paragraph{
        .{ .template_element = original.paragraphs[0].template_element, .source_ordinal = original.paragraphs[0].source_ordinal, .sites = joined.sites, .pieces = joined.pieces, .protected_positions = owned },
        current.paragraphs[1],
        current.paragraphs[3],
    };
    const merged_values: model.Values = .{ .paragraphs = &paragraphs };
    var split_values = try @import("paragraph_structure_split.zig").prepareAnchored(a, &tree, &merged_values, 0, 2, 2, 9, 10000);
    defer split_values.deinit(a);
    const split_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &split_values, .{}, &.{}, 10000);
    defer a.free(split_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, split_xml, "왼쪽😀same"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, split_xml, "오른쪽😀same"));
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, split_xml, "<p:rect>"));
    const section_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &merged_values, .{}, &.{}, 10000);
    defer a.free(section_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_xml, "왼쪽😀same"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_xml, "오른쪽😀same"));
    try std.testing.expect(std.mem.indexOf(u8, section_xml, "id='2'") == null);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, now: *const model.Values, before: *const model.Values, view: *const @import("paragraph_joined_values.zig").Joined, xml: []const u8, merged: *const model.Values) !void {
            var draft = try @import("paragraph_joined_tab_split.zig").prepareOwned(allocator, parsed, view, merged.paragraphs[0].protected_positions.?, 2, 2, 10000);
            defer draft.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), draft.tabs.left.len);
            try std.testing.expectEqual(@as(usize, 1), draft.tabs.right.len);
            const saved = try foldJoined(allocator, parsed, now, before, view, xml, 10000);
            defer allocator.free(saved);
            const first = std.mem.indexOf(u8, saved, "왼쪽😀same") orelse return error.MissingLeftText;
            const second = std.mem.indexOf(u8, saved, "오른쪽😀same") orelse return error.MissingRightText;
            try std.testing.expect(first < second);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "왼쪽😀same"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "오른쪽😀same"));
            const section = try @import("paragraph_structure_save.zig").write(allocator, parsed, merged, .{}, &.{}, 10000);
            defer allocator.free(section);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section, "왼쪽😀same"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section, "오른쪽😀same"));
            var split = try @import("paragraph_structure_split.zig").prepareAnchored(allocator, parsed, merged, 0, 2, 2, 9, 10000);
            defer split.deinit(allocator);
            const split_section = try @import("paragraph_structure_save.zig").write(allocator, parsed, &split, .{}, &.{}, 10000);
            defer allocator.free(split_section);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, split_section, "왼쪽😀same"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, split_section, "오른쪽😀same"));
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, split_section, "<p:rect>"));
        }
    };
    try Probe.run(a, &tree, &current, &original, &joined, rendered, &merged_values);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &tree, &current, &original, &joined, rendered, &merged_values });
    try std.testing.expectEqualStrings(source, tree.source);
}

fn foldDepth(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, original: *const model.Values, parent: usize, rendered: []const u8, limit: usize, depth: usize, joined: ?*const @import("paragraph_joined_values.zig").Joined, owned: ?[]const model.ProtectedPosition, continuation: bool, options: @import("text_sites.zig").Options) ![]u8 {
    if (depth >= 128) return error.LimitExceeded;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.serialized_xml.?);
        changes.deinit(a);
    }
    for (current.paragraphs, 0..) |*child, child_index| {
        if (child.template_element >= tree.elements.len) return error.SourceBindingMismatch;
        var ancestor = tree.elements[child.template_element].parent;
        while (ancestor) |index| {
            if (tree.elements[index].is(@import("document_xml.zig").paragraph_uri, "p")) break;
            ancestor = tree.elements[index].parent;
        }
        var selected = ancestor == parent;
        if (joined) |view| for (view.pieces) |piece| {
            if (ancestor == piece.template_element) selected = true;
        };
        if (!selected) continue;
        if (continuation and removedPageArea(tree, parent, child.template_element)) continue;
        if (owned) |items| {
            const node = tree.elements[child.template_element];
            var retained = false;
            for (items) |item| {
                if (item.kind != .anchor) continue;
                const object = tree.elements[item.element_index];
                if (node.start_tag.start > object.start_tag.start and node.end <= object.end) retained = true;
            }
            if (!retained) continue;
        }
        if (child.generated_id != null) {
            if (child_index == 0 or current.paragraphs[child_index - 1].template_element != child.template_element)
                return error.SourceBindingMismatch;
            continue;
        }
        var group_end = child_index + 1;
        while (group_end < current.paragraphs.len and current.paragraphs[group_end].generated_id != null and current.paragraphs[group_end].template_element == child.template_element) : (group_end += 1) {}
        var before: ?*const model.Paragraph = null;
        for (original.paragraphs) |*candidate| if (candidate.template_element == child.template_element) {
            before = candidate;
            break;
        };
        const baseline = before orelse return error.SourceBindingMismatch;
        const own = if (group_end > child_index + 1)
            try writeSplitGroup(a, tree, current.paragraphs[child_index..group_end], options, limit)
        else if (child.joined()) |view|
            try @import("paragraph_joined_xml.zig").write(a, tree, &view, options, limit)
        else if (child.column_boundaries != null)
            try @import("column_boundary_current_xml.zig").write(a, tree, child, options, limit)
        else if (child.character_styles != null)
            try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, child, &.{}, options, limit)
        else
            try writeText(a, tree, baseline, child, limit);
        defer a.free(own);
        const formatted = if (group_end == child_index + 1 and child.paragraph_shape_id != null) try @import("paragraph_format_write.zig").writeCurrent(a, tree, child.template_element, own, child.paragraph_shape_id.?, limit) else null;
        defer if (formatted) |value| a.free(value);
        const nested = try foldDepth(a, tree, current, original, child.template_element, formatted orelse own, limit, depth + 1, null, null, false, options);
        var nested_owned = true;
        defer if (nested_owned) a.free(nested);
        const raw = tree.sourceOf(child.template_element);
        if (std.mem.eql(u8, raw, nested)) {
            continue;
        }
        const start = if (owned) |items| try @import("paragraph_nested_source.zig").offsetOwned(tree, items, child.template_element, rendered) else if (joined) |view| try @import("paragraph_nested_source.zig").offsetJoined(tree, view, child.template_element, rendered) else try sourceOffset(tree, parent, child.template_element, rendered);
        try changes.append(a, .{ .start = start, .end = start + raw.len, .text = "", .serialized_xml = nested });
        nested_owned = false;
        if (child.joined()) |view| {
            for (view.pieces[1..]) |piece| {
                if (!piece.owns_source or piece.template_element == child.template_element) continue;
                if (piece.template_element >= tree.elements.len or tree.elements[piece.template_element].parent != tree.elements[child.template_element].parent)
                    return error.CrossParagraphOwner;
                const removed = tree.sourceOf(piece.template_element);
                const offset = if (owned) |items| try @import("paragraph_nested_source.zig").offsetOwned(tree, items, piece.template_element, rendered) else if (joined) |hosts| try @import("paragraph_nested_source.zig").offsetJoined(tree, hosts, piece.template_element, rendered) else try sourceOffset(tree, parent, piece.template_element, rendered);
                const empty = try a.alloc(u8, 0);
                errdefer a.free(empty);
                try changes.append(a, .{ .start = offset, .end = offset + removed.len, .text = "", .serialized_xml = empty });
            }
        }
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, rendered, changes.items, limit);
}

fn removedPageArea(tree: *const Tree, parent: usize, child: usize) bool {
    var ancestor = tree.elements[child].parent;
    while (ancestor) |index| {
        if (index == parent) return false;
        if (@import("retained_header_footer.zig").supported(tree, index)) {
            const control = tree.elements[index].parent orelse return false;
            const run = tree.elements[control].parent orelse return false;
            return tree.elements[run].parent == parent and
                @import("paragraph_continuation_metadata.zig").remove(tree.elements[control], true);
        }
        ancestor = tree.elements[index].parent;
    }
    return false;
}

fn writeSplitGroup(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const model.Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (paragraphs) |*paragraph| {
        if (paragraph.protected_positions != null or paragraph.column_boundaries != null)
            return error.UnsupportedStructuralCharacterStyle;
        const xml = if (paragraph.joined()) |view|
            try @import("paragraph_joined_xml.zig").write(a, tree, &view, options, limit -| output.items.len)
        else if (paragraph.character_styles != null)
            try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, paragraph, &.{}, options, limit -| output.items.len)
        else
            try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, tree, paragraph.template_element, &paragraph.sites, options, paragraph.generated_id != null, paragraph.generated_id orelse 0, limit -| output.items.len);
        defer a.free(xml);
        const formatted = if (paragraph.paragraph_shape_id) |id| try @import("paragraph_format_write.zig").writeCurrent(a, tree, paragraph.template_element, xml, id, limit -| output.items.len) else null;
        defer if (formatted) |value| a.free(value);
        const bytes = formatted orelse xml;
        if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, bytes);
    }
    return output.toOwnedSlice(a);
}

test "HWPX nested save retains joined sibling text and removes only its owned source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:rect><p:subList><p:p id='2'><p:run><p:t>A😀</p:t></p:run></p:p><p:p id='3'><p:run><p:t>B</p:t></p:run></p:p><p:p id='4'><p:run><p:t>C</p:t></p:run></p:p></p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var current = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 1, 10000);
    defer current.deinit(a);
    const parent = current.paragraphs[0].template_element;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, now: *const model.Values, before: *const model.Values, element: usize) !void {
            const saved = try fold(allocator, parsed, now, before, element, parsed.sourceOf(element), 10000);
            defer allocator.free(saved);
            try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, saved, "<p:p "));
            try std.testing.expect(std.mem.indexOf(u8, saved, "id='3'") == null);
            for ([_][]const u8{ "<p:t>A😀</p:t>", "<p:t>B</p:t>", "<p:t>C</p:t>" }) |text|
                try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, text));
            try std.testing.expectEqualStrings("B", before.paragraphs[2].sites.items[0].text);
            var split = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, now, 1, 1, 1, 8, 10000);
            defer split.deinit(allocator);
            const resplit = try fold(allocator, parsed, &split, before, element, parsed.sourceOf(element), 10000);
            defer allocator.free(resplit);
            try std.testing.expectEqual(@as(usize, 4), std.mem.count(u8, resplit, "<p:p "));
            const wrapped = try std.mem.concat(allocator, u8, &.{ parsed.source[0..parsed.elements[element].start_tag.start], resplit, parsed.source[parsed.elements[element].end..] });
            defer allocator.free(wrapped);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, wrapped, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
            var text_sites = try @import("text_sites.zig").collect(allocator, &reopened, .{});
            defer text_sites.deinit(allocator);
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(allocator);
            for (text_sites.items) |site| try text.appendSlice(allocator, site.text);
            try std.testing.expectEqualStrings("A😀BC", text.items);
        }
    };
    try Probe.run(a, &tree, &current, &original, parent);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &current, &original, parent });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX nested save actual table join survives parent character properties" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 10));
    _ = session.setCharacterProperties(0, 4, 0, 2, .{ .bold = true }) catch |err| {
        if (@errorReturnTrace()) |trace| std.debug.dumpErrorReturnTrace(trace);
        return err;
    };
    const saved = try session.save();
    defer a.free(saved);
}

test "HWPX nested save retains plain generated child paragraphs" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:rect><p:subList><p:p id='2'><p:run><p:t>A😀B</p:t></p:run></p:p></p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var current = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 1, 1, 1, 3, 10000);
    defer current.deinit(a);
    const parent = current.paragraphs[0].template_element;
    const output = try fold(a, &tree, &current, &original, parent, tree.sourceOf(parent), 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>A</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>😀B</p:t>") != null);
    try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, output, "<p:p "));
    try std.testing.expectEqualStrings("A😀B", original.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, now: *const model.Values, before: *const model.Values, element: usize, expected: []const u8) !void {
            const saved = try fold(allocator, parsed, now, before, element, parsed.sourceOf(element), 10000);
            defer allocator.free(saved);
            try std.testing.expectEqualStrings(expected, saved);
            try std.testing.expectEqualStrings("A😀B", before.paragraphs[1].sites.items[0].text);
        }
    }.run, .{ &tree, &current, &original, parent, output });
}

fn writeText(a: std.mem.Allocator, tree: *const Tree, before: *const model.Paragraph, current: *const model.Paragraph, limit: usize) ![]u8 {
    if (before.sites.items.len != current.sites.items.len) return error.SourceBindingMismatch;
    const node = tree.elements[current.template_element];
    const base = node.start_tag.start;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    for (before.sites.items, current.sites.items) |old, site| {
        var change = (try @import("text_sites_save.zig").siteChange(tree, old, site)) orelse continue;
        if (change.start < base or change.end > node.end) return error.SourceBindingMismatch;
        change.start -= base;
        change.end -= base;
        if (change.run_opening) |opening| {
            if (opening.start < base or opening.end > node.end) return error.SourceBindingMismatch;
            change.run_opening = .{ .start = opening.start - base, .end = opening.end - base };
        }
        try changes.append(a, change);
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.sourceOf(current.template_element), changes.items, limit);
}

test "HWPX nested save folds current text without changing owners and rejects ambiguous source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:rect><p:subList><p:p id='2'><p:run><p:t>old</p:t></p:run><p:linesegarray/></p:p></p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer original.deinit(a);
    var current = try original.clone(a);
    defer current.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &current.paragraphs[1].sites, 0, 0, 0, "앞😀<&", 10000));
    const parent = current.paragraphs[0].template_element;
    const raw = tree.sourceOf(parent);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree, now: *const model.Values, before: *const model.Values, index: usize, input: []const u8) !void {
            const output = try fold(allocator, t, now, before, index, input, 10000);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "앞😀&lt;&amp;old") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:linesegarray/>") != null);
            try std.testing.expectEqualStrings("old", before.paragraphs[1].sites.items[0].text);
            try std.testing.expectEqualStrings("앞😀<&old", now.paragraphs[1].sites.items[0].text);
        }
    };
    try Probe.run(a, &tree, &current, &original, parent, raw);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &current, &original, parent, raw });
    try std.testing.expectError(error.SourceBindingMismatch, fold(a, &tree, &current, &original, parent, "<p:p/>", 10000));
    const duplicate = try std.mem.concat(a, u8, &.{ raw, raw });
    defer a.free(duplicate);
    try std.testing.expectError(error.SourceBindingMismatch, fold(a, &tree, &current, &original, parent, duplicate, 10000));
    try std.testing.expectError(error.LimitExceeded, fold(a, &tree, &current, &original, parent, raw, 1));
}
