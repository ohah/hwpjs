//! 현재 문단 순서에서 같은 직접 소유자의 다음 문단을 찾습니다.
//! 선택은 병합 허용이나 컨트롤 이동을 뜻하지 않습니다.
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn next(tree: *const Tree, current: *const model.Values, index: usize) !?usize {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const selected = &current.paragraphs[index];
    const parent = try owner(tree, selected);
    for (current.paragraphs[index + 1 ..], index + 1..) |*candidate, ordinal| {
        const candidate_parent = try owner(tree, candidate);
        if (candidate_parent == parent) {
            if (candidate.template_element == selected.template_element and
                (candidate.generated_id == null or candidate.source_ordinal != null)) return error.InvalidParagraphAdjacency;
            if (selected.pieces == null and candidate.template_element != selected.template_element) {
                const expected = try @import("paragraph_source_neighbor.zig").next(tree, selected.template_element);
                if (expected != candidate.template_element) return error.InvalidParagraphAdjacency;
            }
            return ordinal;
        }
        // 다른 소유자의 문단을 넘어갈 수 있는 것은 선택 문단 안의 중첩 본문뿐입니다.
        if (!try nested(tree, candidate.template_element, selected)) return null;
    }
    return null;
}

fn owner(tree: *const Tree, paragraph: *const model.Paragraph) !usize {
    const parent = try elementOwner(tree, paragraph.template_element);
    if (paragraph.joined()) |view| {
        try view.validate();
        const first = view.pieces[0];
        if (first.template_element != paragraph.template_element or first.source_ordinal != paragraph.source_ordinal or first.generated_id != paragraph.generated_id)
            return error.SourceBindingMismatch;
        for (view.pieces) |piece|
            if (try elementOwner(tree, piece.template_element) != parent) return error.CrossParagraphOwner;
    }
    return parent;
}

fn elementOwner(tree: *const Tree, element: usize) !usize {
    if (element >= tree.elements.len or !tree.elements[element].is(uri, "p")) return error.InvalidParagraphElement;
    const parent = tree.elements[element].parent orelse return error.InvalidParagraphElement;
    if (parent >= element) return error.SourceBindingMismatch;
    return parent;
}

fn nested(tree: *const Tree, element: usize, selected: *const model.Paragraph) !bool {
    var cursor = element;
    while (tree.elements[cursor].parent) |parent| {
        if (parent >= cursor) return error.SourceBindingMismatch;
        if (parent == selected.template_element) return true;
        if (selected.pieces) |pieces| for (pieces) |piece| {
            if (parent == piece.template_element) return true;
        };
        cursor = parent;
    }
    return false;
}

test "HWPX object host neighbor exposes source merge preservation gap" {
    const std = @import("std");
    const a = std.testing.allocator;
    for ([_][]const u8{ "aligns", "borderfill", "footnote-endnote" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        var report: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
        defer current.deinit(a);
        // aligns의 첫 문단은 구역 선언이며 두 번째 문단부터 글상자 호스트입니다.
        const left: usize = if (std.mem.eql(u8, name, "aligns")) 1 else 0;
        const right = (try next(&section.tree, &current, left)) orelse return error.MissingHostNeighbor;
        try std.testing.expect(right > left + 1);
        try std.testing.expectEqual(section.tree.elements[current.paragraphs[left].template_element].parent, section.tree.elements[current.paragraphs[right].template_element].parent);
        if (std.mem.eql(u8, name, "aligns")) {
            var first = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &current.paragraphs[left]);
            defer first.deinit(a);
            var second = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &current.paragraphs[right]);
            defer second.deinit(a);
            var joined = try @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &section.tree, &first, &second, 4_000_000);
            defer joined.deinit(a);
            const positions = try @import("paragraph_joined_positions.zig").buildWithAnchors(a, &section.tree, &joined);
            defer a.free(positions);
            const owned = try @import("paragraph_protected_positions.zig").side(a, positions, 0, 0, true);
            defer a.free(owned);
            try std.testing.expectEqual(@as(usize, 2), owned.len);
            const xml = try @import("paragraph_joined_xml.zig").writeOwnedAnchors(a, &section.tree, &joined, @import("editor_session.zig").siteOptions(session.options), 4_000_000, owned);
            defer a.free(xml);
            for (owned) |item| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, section.tree.sourceOf(item.element_index)));
            const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
            defer a.free(rows);
            var output_index: usize = 0;
            for (current.paragraphs, 0..) |paragraph, index| {
                if (index == right) continue;
                rows[output_index] = if (index == left)
                    .{ .template_element = paragraph.template_element, .source_ordinal = paragraph.source_ordinal, .sites = joined.sites, .pieces = joined.pieces, .protected_positions = owned }
                else
                    paragraph;
                output_index += 1;
            }
            const borrowed: model.Values = .{ .paragraphs = rows };
            var values = try borrowed.clone(a);
            defer values.deinit(a);
            _ = try @import("text_site_edit.zig").splice(a, &values.paragraphs[left + 1].sites, 0, 0, 0, "중첩😀", 4_000_000);
            const sections = try a.dupe(@import("editor_session.zig").Section, session.sections);
            defer a.free(sections);
            try std.testing.expectEqual(@as(usize, 1), sections.len);
            sections[0].sites = .{ .items = &.{} };
            sections[0].structure_values = values;
            sections[0].last_paragraph -= 1;
            var proxy = session;
            proxy.sections = sections;
            const zip = try proxy.save();
            defer a.free(zip);
            var reopened = try @import("editor_session.zig").open(a, zip, .{});
            defer reopened.deinit();
            try std.testing.expectEqual(section.last_paragraph - 1, reopened.sections[0].last_paragraph);
            const nested_text = try reopened.anchorText(0, reopened.sections[0].first_paragraph + left + 1);
            defer a.free(nested_text);
            try std.testing.expect(std.mem.startsWith(u8, nested_text, "중첩😀"));
            var public_session = try @import("editor_session.zig").open(a, input, .{});
            defer public_session.deinit();
            const first_paragraph = public_session.sections[0].first_paragraph;
            try std.testing.expect(try public_session.mergeParagraphPair(0, first_paragraph + left, first_paragraph + right));
            try std.testing.expect(try public_session.canEdit(0, first_paragraph + left));
            try std.testing.expect(try public_session.splice(0, first_paragraph + left, 0, 0, "호스트😀"));
            const public_zip = try public_session.save();
            defer a.free(public_zip);
            var public_reopened = try @import("editor_session.zig").open(a, public_zip, .{});
            defer public_reopened.deinit();
            const public_text = try public_reopened.anchorText(0, first_paragraph + left);
            defer a.free(public_text);
            try std.testing.expect(std.mem.startsWith(u8, public_text, "호스트😀"));
        }
        // 후보 지원과 공개 저장 거래의 검증 범위를 구분합니다.
        var candidate = @import("paragraph_structure_merge.zig").preparePair(a, &section.tree, &current, left, right, 4_000_000) catch |err| {
            const expected: anyerror = if (std.mem.eql(u8, name, "aligns")) error.UnsupportedParagraphControl else error.UnsupportedColumnBoundaryEdit;
            try std.testing.expectEqual(expected, err);
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
            continue;
        };
        candidate.deinit(a);
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
    }
}

test "HWPX current neighbor preserves nested owners and generated paragraph order" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:footNote><p:subList><p:p/></p:subList></p:footNote></p:ctrl></p:run></p:p><p:p/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), current.paragraphs.len);
    try std.testing.expectEqual(@as(?usize, 2), try next(&tree, &current, 0));
    try std.testing.expectEqual(@as(?usize, null), try next(&tree, &current, 1));
    try std.testing.expectEqual(@as(?usize, null), try next(&tree, &current, 2));
    try std.testing.expectError(error.InvalidParagraphIndex, next(&tree, &current, 3));
    var rows = [_]model.Paragraph{ current.paragraphs[0], current.paragraphs[0], current.paragraphs[1], current.paragraphs[2] };
    rows[1].source_ordinal = null;
    rows[1].generated_id = 17;
    const edited: model.Values = .{ .paragraphs = &rows };
    try std.testing.expectEqual(@as(?usize, 1), try next(&tree, &edited, 0));
    try std.testing.expectEqual(@as(?usize, 3), try next(&tree, &edited, 1));
    rows[1].generated_id = null;
    try std.testing.expectError(error.InvalidParagraphAdjacency, next(&tree, &edited, 0));
    rows[1].generated_id = 17;
    rows[1].source_ordinal = rows[0].source_ordinal;
    try std.testing.expectError(error.InvalidParagraphAdjacency, next(&tree, &edited, 0));
    rows[1].source_ordinal = null;
    const original_parent = tree.elements[rows[2].template_element].parent;
    tree.elements[rows[2].template_element].parent = rows[2].template_element;
    try std.testing.expectError(error.SourceBindingMismatch, next(&tree, &edited, 1));
    tree.elements[rows[2].template_element].parent = original_parent;
}
