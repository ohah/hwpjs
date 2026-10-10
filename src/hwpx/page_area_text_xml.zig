//! 원본 쪽 영역 컨테이너를 같은 run의 텍스트 경계에 출력합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Site = @import("text_sites.zig").Site;
pub const Local = @import("text_metadata_fragment.zig").Local;

pub fn writeManyFrom(a: std.mem.Allocator, tree: *const Tree, site: Site, source: *const Tree, positions: []const Local, limit: usize) ![]u8 {
    return @import("text_metadata_fragment.zig").writeManyFrom(a, tree, site, source, positions, limit, writeControl);
}

fn writeControl(a: std.mem.Allocator, tree: *const Tree, source_element: usize, limit: usize) ![]u8 {
    return @import("xml_subtree_closure.zig").write(a, tree, try control(tree, source_element), limit);
}

pub fn control(tree: *const Tree, source_element: usize) !usize {
    if (source_element >= tree.elements.len or !@import("retained_header_footer.zig").supported(tree, source_element)) return error.InvalidPageAreaSource;
    const area = tree.elements[source_element];
    const control_index = area.parent orelse return error.InvalidPageAreaSource;
    const uri = @import("document_xml.zig").paragraph_uri;
    if (!tree.elements[control_index].is(uri, "ctrl") or tree.elements[control_index].first_child != source_element or area.next_sibling != null) return error.UnsupportedMixedPageAreaControl;
    const run = tree.elements[control_index].parent orelse return error.InvalidPageAreaSource;
    const paragraph = tree.elements[run].parent orelse return error.InvalidPageAreaSource;
    if (!tree.elements[run].is(uri, "run") or !tree.elements[paragraph].is(uri, "p") or !@import("retained_run_metadata.zig").supported(tree, control_index)) return error.InvalidPageAreaSource;
    return control_index;
}

test "page area text XML preserves closed original control and target run Unicode" {
    const a = std.testing.allocator;
    const source_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:header id='9' applyPageType='BOTH'><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run><p:linesegarray/></p:p></p:subList></p:header></p:ctrl><p:t>original</p:t></p:run></p:p></s:sec>";
    const target_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:p><q:run charPrIDRef='7'><q:t>A😀&amp;B</q:t></q:run></q:p></s:sec>";
    var source = try @import("xml_part_tree.zig").parse(a, source_xml, .section, 0, 0, .{});
    defer source.deinit(a);
    var target = try @import("xml_part_tree.zig").parse(a, target_xml, .section, 0, 0, .{});
    defer target.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &target, .{});
    defer sites.deinit(a);
    const fragment = try writeManyFrom(a, &target, sites.items[0], &source, &.{.{ .source_element = 4, .unit = 3 }}, 10000);
    defer a.free(fragment);
    const output = try @import("xml_source_writer.zig").write(a, target_xml, &.{.{ .start = sites.items[0].start, .end = sites.items[0].end, .text = "", .serialized_xml = fragment }}, 10000);
    defer a.free(output);
    var restored = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer restored.deinit(a);
    try std.testing.expect(std.mem.indexOf(u8, output, source.sourceOf(4)) != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "charPrIDRef='7'"));
    var restored_sites = try @import("text_sites.zig").collect(a, &restored, .{});
    defer restored_sites.deinit(a);
    try std.testing.expectEqualStrings("A😀", restored_sites.items[0].text);
    try std.testing.expectEqualStrings("HEAD", restored_sites.items[1].text);
    try std.testing.expectEqualStrings("&B", restored_sites.items[2].text);
    try std.testing.expectError(error.SplitSurrogatePair, writeManyFrom(a, &target, sites.items[0], &source, &.{.{ .source_element = 4, .unit = 2 }}, 10000));
    try std.testing.expectError(error.InvalidPageAreaSource, writeManyFrom(a, &target, sites.items[0], &source, &.{.{ .source_element = 0, .unit = 0 }}, 10000));
    try std.testing.expectError(error.LimitExceeded, writeManyFrom(a, &target, sites.items[0], &source, &.{.{ .source_element = 4, .unit = 3 }}, fragment.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *const Tree, site: Site, original: *const Tree) !void {
            const bytes = try writeManyFrom(allocator, current, site, original, &.{.{ .source_element = 4, .unit = 3 }}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &target, sites.items[0], &source });
    try std.testing.expectEqualStrings(source_xml, source.source);
    try std.testing.expectEqualStrings(target_xml, target.source);
    var mixed = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:header><p:subList/></p:header><p:footer><p:subList/></p:footer></p:ctrl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer mixed.deinit(a);
    try std.testing.expectError(error.UnsupportedMixedPageAreaControl, writeManyFrom(a, &target, sites.items[0], &mixed, &.{.{ .source_element = 4, .unit = 3 }}, 10000));
}
