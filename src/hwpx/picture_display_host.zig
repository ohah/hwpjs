//! 그림 원본의 문단 출처만 연결합니다. 활성 분기와 배치는 결정하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn sourceTemplate(tree: *const Tree, picture: usize) !usize {
    if (picture >= tree.elements.len or !tree.elements[picture].is(xml.paragraph_uri, "pic")) return error.InvalidPictureDisplayNode;
    var child = picture;
    var template: ?usize = null;
    while (tree.elements[child].parent) |parent| {
        // 원본 트리는 전위 순서이므로 역방향·순환 부모를 허용하지 않습니다.
        if (parent >= child) return error.InvalidPartTree;
        if (tree.elements[parent].is(xml.paragraph_uri, "switch")) return error.UnsupportedPictureSwitchHost;
        if (template == null and tree.elements[parent].is(xml.paragraph_uri, "p")) template = parent;
        child = parent;
    }
    return template orelse error.MissingPictureDisplayParagraph;
}

pub fn currentOrdinal(tree: *const Tree, paragraphs: []const Paragraph, first: usize, picture: usize) !usize {
    const template = try sourceTemplate(tree, picture);
    for (paragraphs) |paragraph| {
        if (!try @import("paragraph_display_host.zig").matchesTemplate(&paragraph, template)) continue;
        if (paragraph.protected_positions != null) {
            return @import("protected_display_host.zig").currentOrdinal(paragraphs, first, template, try sourceAnchor(tree, picture));
        }
    }
    return @import("paragraph_display_host.zig").currentOrdinal(paragraphs, first, template);
}

/// 그림 자체 또는 이를 감싸는 최외곽 컨테이너의 본문 보호 앵커입니다.
/// 컨테이너 내부 좌표를 본문 좌표로 변환하지 않습니다.
pub fn sourceAnchor(tree: *const Tree, picture: usize) !usize {
    _ = try sourceTemplate(tree, picture);
    var candidate = picture;
    while (true) {
        const kind = @import("run_anchor.zig").kind(tree, candidate);
        if ((candidate == picture and kind == .picture) or (candidate != picture and kind == .container)) return candidate;
        const parent = tree.elements[candidate].parent orelse return error.UnsupportedPictureAnchor;
        if (!tree.elements[parent].is(xml.paragraph_uri, "container")) return error.UnsupportedPictureAnchor;
        candidate = parent;
    }
}

test "HWPX picture source anchor distinguishes group ownership from inner coordinates" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:container><p:container><p:pic/></p:container><p:pic/></p:container><p:pic/><p:rect><p:pic/></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), try sourceAnchor(&tree, 5));
    try std.testing.expectEqual(@as(usize, 3), try sourceAnchor(&tree, 6));
    try std.testing.expectEqual(@as(usize, 7), try sourceAnchor(&tree, 7));
    try std.testing.expectError(error.UnsupportedPictureAnchor, sourceAnchor(&tree, 9));
    try std.testing.expectError(error.InvalidPictureDisplayNode, sourceAnchor(&tree, 3));
    tree.elements[4].parent = 5;
    try std.testing.expectError(error.InvalidPartTree, sourceAnchor(&tree, 5));
}

/// 현재 텍스트에서 파생한 보호 앵커의 UTF-16 시작 위치입니다.
pub fn anchorUnit(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, picture: usize) !usize {
    const template = try sourceTemplate(tree, picture);
    if (!try @import("paragraph_display_host.zig").matchesTemplate(paragraph, template)) return error.SourceBindingMismatch;
    if (@import("run_anchor.zig").kind(tree, picture) != .picture) return error.UnsupportedPictureAnchor;
    return anchorPosition(a, tree, paragraph, picture);
}

pub const OwningAnchor = struct { source_node: usize, unit: usize };

/// 외부 모델에는 그림 노드와 소유 앵커 노드를 별도로 전달해야 합니다.
pub fn owningAnchor(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, picture: usize) !OwningAnchor {
    const template = try sourceTemplate(tree, picture);
    if (!try @import("paragraph_display_host.zig").matchesTemplate(paragraph, template)) return error.SourceBindingMismatch;
    const source_node = try sourceAnchor(tree, picture);
    return .{ .source_node = source_node, .unit = try anchorPosition(a, tree, paragraph, source_node) };
}

fn anchorPosition(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, source_node: usize) !usize {
    return @import("protected_display_host.zig").anchorPosition(a, tree, paragraph, source_node) catch |err| switch (err) {
        error.MissingProtectedDisplayAnchor => error.MissingPictureDisplayAnchor,
        else => err,
    };
}

test "HWPX picture source anchor resolves tracked container ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(xml.paragraph_uri, "pic")) continue;
        const host = try sourceAnchor(tree, index);
        try std.testing.expect(host != index);
        try std.testing.expect(tree.elements[host].is(xml.paragraph_uri, "container"));
        try std.testing.expectEqual(try sourceTemplate(tree, index), tree.elements[tree.elements[host].parent.?].parent.?);
        var current = try @import("display_current_paragraphs.zig").read(a, &session.sections[0], session.options);
        defer current.deinit(a);
        const ordinal = try currentOrdinal(tree, current.paragraphs, session.sections[0].first_paragraph, index);
        const paragraph = &current.paragraphs[ordinal - session.sections[0].first_paragraph];
        const before = try owningAnchor(a, tree, paragraph, index);
        try std.testing.expectEqual(host, before.source_node);
        try std.testing.expectError(error.UnsupportedPictureAnchor, anchorUnit(a, tree, paragraph, index));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree, value: *const Paragraph, node: usize, expected: OwningAnchor) !void {
                const actual = try owningAnchor(allocator, parsed, value, node);
                try std.testing.expectEqual(expected.source_node, actual.source_node);
                try std.testing.expectEqual(expected.unit, actual.unit);
            }
        }.run, .{ tree, paragraph, index, before });
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "HWPX picture owning anchor follows current group text without changing picture identity" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:container><p:pic/></p:container><p:t>끝</p:t></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try @import("text_sites.zig").collect(a, &tree, .{}) };
    defer paragraph.deinit(a);
    const before = try owningAnchor(a, &tree, &paragraph, 5);
    try std.testing.expectEqual(@as(usize, 4), before.source_node);
    try std.testing.expectEqual(@as(usize, 3), before.unit);
    _ = try @import("text_site_edit.zig").splice(a, &paragraph.sites, 0, 0, 0, "앞😀", 1000);
    const after = try owningAnchor(a, &tree, &paragraph, 5);
    try std.testing.expectEqual(before.source_node, after.source_node);
    try std.testing.expectEqual(@as(usize, 6), after.unit);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX picture display anchor uses current UTF16 text and releases allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:pic/><p:t>끝</p:t></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try @import("text_sites.zig").collect(a, &tree, .{}) };
    defer paragraph.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), try anchorUnit(a, &tree, &paragraph, 4));
    _ = try @import("text_site_edit.zig").splice(a, &paragraph.sites, 0, 0, 0, "앞😀", 1000);
    try std.testing.expectEqual(@as(usize, 6), try anchorUnit(a, &tree, &paragraph, 4));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Paragraph) !void {
            try std.testing.expectEqual(@as(usize, 6), try anchorUnit(allocator, parsed, current, 4));
        }
    }.run, .{ &tree, &paragraph });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX picture display host validates ancestry and current provenance" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:pic/></p:run></p:p><p:p><p:run><p:switch><p:pic/></p:switch></p:run></p:p><p:pic/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const empty: @import("text_sites.zig").Sites = .{ .items = &.{} };
    var paragraphs = [_]Paragraph{.{ .template_element = 1, .source_ordinal = 1, .sites = empty }};
    try std.testing.expectEqual(@as(usize, 1), try sourceTemplate(&tree, 3));
    try std.testing.expectEqual(@as(usize, 7), try currentOrdinal(&tree, &paragraphs, 7, 3));
    try std.testing.expectError(error.UnsupportedPictureSwitchHost, sourceTemplate(&tree, 7));
    try std.testing.expectError(error.MissingPictureDisplayParagraph, sourceTemplate(&tree, 8));
    try std.testing.expectError(error.InvalidPictureDisplayNode, sourceTemplate(&tree, 1));
    try std.testing.expectError(error.InvalidPictureDisplayNode, sourceTemplate(&tree, tree.elements.len));
    paragraphs[0].template_element = 99;
    try std.testing.expectError(error.MissingCurrentParagraphDisplayHost, currentOrdinal(&tree, &paragraphs, 7, 3));
    tree.elements[3].parent = 3;
    try std.testing.expectError(error.InvalidPartTree, sourceTemplate(&tree, 3));
}

test "HWPX picture display host rejects switches outside the owning paragraph" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:switch><p:p><p:run><p:pic/></p:run></p:p></p:switch></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedPictureSwitchHost, sourceTemplate(&tree, 4));
}

test "HWPX picture display host resolves tracked picture fixture without changing saved bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var pictures: usize = 0;
    for (session.sections) |*section| {
        var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
        defer view.deinit(a);
        for (section.tree.elements, 0..) |element, index| {
            if (!element.is(xml.paragraph_uri, "pic")) continue;
            const ordinal = try currentOrdinal(&section.tree, view.paragraphs, section.first_paragraph, index);
            try std.testing.expect(ordinal >= section.first_paragraph and ordinal <= section.last_paragraph);
            _ = try anchorUnit(a, &section.tree, &view.paragraphs[ordinal - section.first_paragraph], index);
            pictures += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 11), pictures);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "HWPX picture display host tracks preceding splits and preserves refused picture splits" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var picture: ?usize = null;
    for (section.tree.elements, 0..) |element, index| {
        if (element.is(xml.paragraph_uri, "pic")) {
            picture = index;
        }
    }
    const node = picture orelse return error.MissingPictureDisplayNode;
    var before = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    const original = try currentOrdinal(&section.tree, before.paragraphs, section.first_paragraph, node);
    before.deinit(a);
    try std.testing.expectError(error.UnsupportedParagraphControl, session.splitParagraph(0, original, 0, 0));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    var split = false;
    for (section.first_paragraph..original) |paragraph| {
        _ = session.splitParagraph(0, paragraph, 0, 0) catch |err| switch (err) {
            error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.UnsupportedMergeMetadata, error.MissingTextSite => continue,
            else => return err,
        };
        split = true;
        break;
    }
    try std.testing.expect(split);
    var after = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer after.deinit(a);
    try std.testing.expectEqual(original + 1, try currentOrdinal(&section.tree, after.paragraphs, section.first_paragraph, node));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    var count: usize = 0;
    var reopened_last: ?usize = null;
    for (reopened.sections) |*part| {
        var view = try @import("display_current_paragraphs.zig").read(a, part, reopened.options);
        defer view.deinit(a);
        for (part.tree.elements, 0..) |element, index| {
            if (!element.is(xml.paragraph_uri, "pic")) continue;
            count += 1;
            reopened_last = try currentOrdinal(&part.tree, view.paragraphs, part.first_paragraph, index);
        }
    }
    try std.testing.expectEqual(@as(usize, 11), count);
    try std.testing.expectEqual(@as(?usize, original + 1), reopened_last);
}
