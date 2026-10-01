//! Structural ownership for selected field editing, separate from raw reports.
const tree_module = @import("xml_part_tree.zig");
const selection = @import("xml_tree_selection.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Returns the direct owning paragraph. Raw field observation deliberately
/// permits more contexts; this function is only an editing prerequisite.
pub fn paragraph(tree: *const tree_module.Tree, frames: []const selection.Frame, index: usize) !usize {
    if (frames.len != tree.elements.len or index >= tree.elements.len) return error.InvalidFieldElement;
    const element = tree.elements[index];
    if (!element.is(uri, "fieldBegin") and !element.is(uri, "fieldEnd")) return error.InvalidFieldElement;
    if (!frames[index].active or frames[index].in_text) return error.UnsupportedFieldOwnership;
    const ctrl = element.parent orelse return error.UnsupportedFieldOwnership;
    if (ctrl >= index or !tree.elements[ctrl].is(uri, "ctrl")) return error.UnsupportedFieldOwnership;
    var run = tree.elements[ctrl].parent orelse return error.UnsupportedFieldOwnership;
    var child_index = ctrl;
    if (run >= child_index) return error.UnsupportedFieldOwnership;
    while (frames[run].kind == .branch or frames[run].kind == .switch_element) {
        if (run >= child_index or !frames[run].active or frames[run].in_text) return error.UnsupportedFieldOwnership;
        child_index = run;
        run = tree.elements[run].parent orelse return error.UnsupportedFieldOwnership;
        if (run >= child_index) return error.UnsupportedFieldOwnership;
    }
    if (run >= ctrl or !tree.elements[run].is(uri, "run") or frames[run].kind != .run) return error.UnsupportedFieldOwnership;
    const owner = tree.elements[run].parent orelse return error.UnsupportedFieldOwnership;
    if (owner >= run or !tree.elements[owner].is(uri, "p")) return error.UnsupportedFieldOwnership;
    return owner;
}

test "HWPX field ownership rejects inline lookalikes foreign controls and inactive selection" {
    const std = @import("std");
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'>";
    const bodies = [_][]const u8{
        "<p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run></p:p>",
        "<p:p><p:run><p:t><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:run></p:t></p:run></p:p>",
        "<p:p><p:run><f:ctrl><p:fieldBegin id='1'/></f:ctrl></p:run></p:p>",
        "<p:p><p:run><p:fieldBegin id='1'/></p:run></p:p>",
    };
    for (bodies, 0..) |body, case_index| {
        const source = try std.mem.concat(a, u8, &.{ prefix, body, "</s:sec>" });
        defer a.free(source);
        var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        const frames = try selection.build(a, &tree, .{ .mode = .selected }, 4096);
        defer a.free(frames);
        for (tree.elements, 0..) |element, index| {
            if (!element.is(uri, "fieldBegin")) continue;
            if (case_index == 0) {
                try std.testing.expectEqual(@as(usize, 1), try paragraph(&tree, frames, index));
                frames[index].active = false;
                try std.testing.expectError(error.UnsupportedFieldOwnership, paragraph(&tree, frames, index));
            } else try std.testing.expectError(error.UnsupportedFieldOwnership, paragraph(&tree, frames, index));
            try std.testing.expectError(error.InvalidFieldElement, paragraph(&tree, &.{}, index));
        }
    }
}

test "HWPX field ownership binds actual hyperlink start and end paragraphs" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const frames = try selection.build(a, &tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "fieldBegin") and !element.is(uri, "fieldEnd")) continue;
        const owner = try paragraph(&tree, frames, index);
        try std.testing.expect(tree.elements[owner].is(uri, "p"));
        count += 1;
    }
    try std.testing.expect(count >= 2);
}

test "HWPX field ownership follows actual selected switch branches without activating fallback" {
    const std = @import("std");
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:switch><p:case p:required-namespace='urn:feature'><p:ctrl><p:fieldBegin id='1'/></p:ctrl></p:case><p:default><p:ctrl><p:fieldBegin id='2'/></p:ctrl></p:default></p:switch></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    for ([_]bool{ false, true }) |supports_feature| {
        const frames = try selection.build(a, &tree, .{ .mode = .selected, .supported_namespaces = if (supports_feature) &.{"urn:feature"} else &.{} }, 4096);
        defer a.free(frames);
        var ordinal: usize = 0;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(uri, "fieldBegin")) continue;
            const expected_active = if (supports_feature) ordinal == 0 else ordinal == 1;
            if (expected_active) {
                try std.testing.expectEqual(@as(usize, 1), try paragraph(&tree, frames, index));
            } else try std.testing.expectError(error.UnsupportedFieldOwnership, paragraph(&tree, frames, index));
            ordinal += 1;
        }
        try std.testing.expectEqual(@as(usize, 2), ordinal);
    }
}
