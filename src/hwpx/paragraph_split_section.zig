//! Single source-bound structural replacement; not an editable XML cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Draft = @import("paragraph_split_text.zig").Draft;
const paragraphs = @import("paragraph_split_xml.zig");

/// All non-target XML remains immutable source. Session integration must also
/// serialize other current edits; it must not replace those values with source.
pub fn write(a: std.mem.Allocator, tree: *const Tree, draft: *const Draft, id: u32, max_bytes: usize) ![]u8 {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    if (draft.paragraph_element >= tree.elements.len) return error.InvalidParagraphElement;
    const owner = tree.elements[draft.paragraph_element];
    const left = try paragraphs.write(a, tree, draft, false, 0, max_bytes);
    defer a.free(left);
    const right = try paragraphs.write(a, tree, draft, true, id, max_bytes);
    defer a.free(right);
    return join(a, tree, owner, left, right, max_bytes);
}

/// 선택 문단의 앵커 분할 조각을 원문 구역에 연결합니다. 다른 현재 편집의 저장은 호출자 책임입니다.
pub fn writeAnchored(a: std.mem.Allocator, tree: *const Tree, sites: *const @import("text_sites.zig").Sites, locations: []const @import("section_text.zig").Location, options: @import("text_sites.zig").Options, paragraph: usize, start: u32, end: u32, id: u32, max_bytes: usize) ![]u8 {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    const owner_index = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    const left = try paragraphs.writeAnchored(a, tree, sites, locations, options, paragraph, start, end, false, 0, max_bytes);
    defer a.free(left);
    const right = try paragraphs.writeAnchored(a, tree, sites, locations, options, paragraph, start, end, true, id, max_bytes);
    defer a.free(right);
    return join(a, tree, tree.elements[owner_index], left, right, max_bytes);
}

fn join(a: std.mem.Allocator, tree: *const Tree, owner: @import("xml_part_tree.zig").Element, left: []const u8, right: []const u8, max_bytes: usize) ![]u8 {
    const kept = tree.source.len - (owner.end - owner.start_tag.start);
    const pair = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    const length = std.math.add(usize, kept, pair) catch return error.LimitExceeded;
    if (length > max_bytes) return error.LimitExceeded;
    const output = try a.alloc(u8, length);
    const prefix = owner.start_tag.start;
    @memcpy(output[0..prefix], tree.source[0..prefix]);
    @memcpy(output[prefix..][0..left.len], left);
    @memcpy(output[prefix + left.len ..][0..right.len], right);
    @memcpy(output[prefix + pair ..], tree.source[owner.end..]);
    return output;
}

test "HWPX split Section preserves opaque surrounding XML and is allocation atomic" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><!--before--><p:p id='1'><p:run><p:t>AB</p:t></p:run></p:p><!--after--><unknown keep='1'/></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepare(a, &tree, &sites, locations, 1, 1, 1, 1000);
    defer draft.deinit(a);
    const output = try write(a, &tree, &draft, 2, 1000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<!--before--><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p><!--after--><unknown keep='1'/>") != null);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, &draft, 2, output.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree, current: *const Draft) !void {
            const bytes = try write(allocator, borrowed, current, 2, 1000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &draft });
    try std.testing.expectEqualStrings(source, tree.source);
}
