//! Select one opaque object while retaining ownership of the entire switch.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const selection = @import("compatibility_selection.zig");
const gaps = @import("element_whitespace_gaps.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Anchor = struct { wrapper: usize, branch: usize, object: usize };

/// Structural retention only; never selects a capability or interprets payload.
pub fn supported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const wrapper = tree.elements[index];
    if (!wrapper.is(uri, "switch")) return false;
    const run = wrapper.parent orelse return false;
    const paragraph = tree.elements[run].parent orelse return false;
    if (!tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p")) return false;
    if (!gaps.empty(tree, index)) return false;
    var shape: @import("switch_shape.zig").State = .{};
    var child = wrapper.first_child;
    while (child) |branch_index| {
        const branch = tree.elements[branch_index];
        const is_case = branch.is(uri, "case");
        if (!is_case and !branch.is(uri, "default")) return false;
        if (is_case) {
            shape.cases += 1;
            shape.case_after_default = shape.case_after_default or shape.defaults != 0;
        } else shape.defaults += 1;
        const object = branch.first_child orelse return false;
        if (tree.elements[object].next_sibling != null or !gaps.empty(tree, branch_index)) return false;
        if (!tree.elements[object].is(uri, if (is_case) "chart" else "ole")) return false;
        child = branch.next_sibling;
    }
    return shape.cases > 0 and shape.defaults == 1 and !shape.case_after_default;
}

/// Selection capability does not imply chart rendering or payload editing.
pub fn resolve(a: std.mem.Allocator, tree: *const Tree, index: usize, policy: selection.Policy) !?Anchor {
    try selection.validate(policy);
    if (policy.mode != .selected) return error.AmbiguousSwitchSelection;
    if (index >= tree.elements.len) return null;
    const wrapper = tree.elements[index];
    if (!wrapper.is(uri, "switch")) return null;
    const run = wrapper.parent orelse return null;
    const paragraph = tree.elements[run].parent orelse return null;
    if (!tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p")) return null;
    if (!supported(tree, index)) return error.UnsupportedSwitchAnchorShape;
    var state: selection.State = .{};
    var result: ?Anchor = null;
    var child = wrapper.first_child;
    while (child) |branch_index| {
        const branch = tree.elements[branch_index];
        const is_case = branch.is(uri, "case");
        const object = branch.first_child.?;
        if (try selection.chooseTree(a, tree, branch_index, is_case, 4096, policy, &state)) result = .{ .wrapper = index, .branch = branch_index, .object = object };
        child = branch.next_sibling;
    }
    return result;
}

test "switch anchor uses shared capability selection and retains wrapper ownership" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:switch><p:case p:required-namespace='urn:chart'><p:chart/></p:case><p:default><p:ole/></p:default></p:switch></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const fallback = (try resolve(a, &tree, 3, .{ .mode = .selected })).?;
    try std.testing.expectEqual(@as(usize, 3), fallback.wrapper);
    try std.testing.expect(tree.elements[fallback.object].is(uri, "ole"));
    const chart = (try resolve(a, &tree, 3, .{ .mode = .selected, .supported_namespaces = &.{"urn:chart"} })).?;
    try std.testing.expect(tree.elements[chart.object].is(uri, "chart"));
    try std.testing.expectEqual(fallback.wrapper, chart.wrapper);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.AmbiguousSwitchSelection, resolve(a, &tree, 3, .{}));
    try std.testing.expect(try resolve(a, &tree, 5, .{ .mode = .selected }) == null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const anchor = (try resolve(allocator, parsed, 3, .{ .mode = .selected })).?;
            try std.testing.expect(parsed.elements[anchor.object].is(uri, "ole"));
        }
    }.run, .{&tree});
}

test "switch anchor refuses ambiguous branches and unindexed text" {
    const a = std.testing.allocator;
    const case = "<p:case p:required-namespace='urn:chart'><p:chart/></p:case>";
    const fallback = "<p:default><p:ole/></p:default>";
    for ([_][]const u8{
        case ++ fallback ++ fallback,
        fallback ++ case,
        case,
        fallback,
        case ++ "<p:default><p:ole/><p:ole/></p:default>",
        case ++ "<p:default>text<p:ole/></p:default>",
        "text" ++ case ++ fallback,
        case ++ "<p:default><p:pic/></p:default>",
    }) |body| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:switch>", body, "</p:switch></p:run></p:p></s:sec>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedSwitchAnchorShape, resolve(a, &tree, 3, .{ .mode = .selected }));
        try std.testing.expect(!supported(&tree, 3));
        try std.testing.expect(@import("run_anchor.zig").kind(&tree, 3) == null);
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "switch anchor classifier rejects foreign namespace and non-direct ownership" {
    const a = std.testing.allocator;
    const body = "<p:case p:required-namespace='urn:chart'><p:chart/></p:case><p:default><p:ole/></p:default>";
    for ([_][]const u8{
        "<p:ctrl><p:switch>" ++ body ++ "</p:switch></p:ctrl>",
        "<p:t><p:switch>" ++ body ++ "</p:switch></p:t>",
        "<x:switch>" ++ body ++ "</x:switch>",
    }) |content| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>", content, "</p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |_, index| {
            try std.testing.expect(!supported(&tree, index));
            try std.testing.expect(@import("run_anchor.zig").kind(&tree, index) == null);
            try std.testing.expect(try resolve(a, &tree, index, .{ .mode = .selected }) == null);
        }
        try std.testing.expect(!supported(&tree, tree.elements.len));
        try std.testing.expect(try resolve(a, &tree, tree.elements.len, .{ .mode = .selected }) == null);
    }
}

test "switch anchor resolves actual chart fallback without modifying source ZIP" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Contents/section0.xml").?, 4000000);
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "switch")) continue;
        count += 1;
        const fallback = (try resolve(a, &tree, index, .{ .mode = .selected })).?;
        const chart = (try resolve(a, &tree, index, .{ .mode = .selected, .supported_namespaces = &.{"http://www.hancom.co.kr/hwpml/2016/ooxmlchart"} })).?;
        try std.testing.expect(tree.elements[fallback.object].is(uri, "ole"));
        try std.testing.expect(tree.elements[chart.object].is(uri, "chart"));
        try std.testing.expectEqual(index, fallback.wrapper);
        try std.testing.expectEqual(index, chart.wrapper);
        try std.testing.expect(fallback.branch != chart.branch);
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqualSlices(u8, before, input);
    try std.testing.expectEqualSlices(u8, xml, tree.source);
}

test "switch anchor covers reference chart directory" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "reference/rhwp/samples/chart", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var wrappers: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
        const input = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16000000));
        defer a.free(input);
        var archive = try @import("../zip/archive.zig").open(a, input, .{});
        defer archive.deinit();
        var file_wrappers: usize = 0;
        for (archive.entries) |part| {
            if (!std.mem.startsWith(u8, part.name, "Contents/section") or !std.mem.endsWith(u8, part.name, ".xml")) continue;
            const xml = try archive.decode(part, 16000000);
            defer a.free(xml);
            var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
            defer tree.deinit(a);
            for (tree.elements, 0..) |element, index| {
                if (!element.is(uri, "switch")) continue;
                const fallback = (try resolve(a, &tree, index, .{ .mode = .selected })).?;
                try std.testing.expectEqual(index, fallback.wrapper);
                try std.testing.expect(tree.elements[fallback.object].is(uri, "ole"));
                file_wrappers += 1;
            }
            try std.testing.expectEqualSlices(u8, xml, tree.source);
        }
        try std.testing.expect(file_wrappers > 0);
        files += 1;
        wrappers += file_wrappers;
    }
    try std.testing.expect(files > 0);
    std.debug.print("Switch chart corpus: {d} files, {d} wrappers\n", .{ files, wrappers });
}
