//! 같은 원본 문단의 선언 제거와 텍스트 경계 출력을 원자적으로 조립합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
const fragment = @import("text_metadata_fragment.zig");
const writer = @import("xml_source_writer.zig");
pub const Move = struct { source_element: usize, source_control: usize, unit: u32 };
pub const Request = struct { paragraph: usize, move: Move };
const Group = struct { site: usize, positions: std.ArrayList(fragment.Local) = .empty };

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, paragraph: usize, moves: []const Move, limit: usize, comptime fragmentWriter: anytype) ![]u8 {
    if (moves.len > tree.elements.len or tree.source.len > limit) return error.LimitExceeded;
    if (moves.len == 0) return a.dupe(u8, tree.source);
    const owner = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    const requests = try a.alloc(Request, moves.len);
    defer a.free(requests);
    for (moves, requests) |move, *request| request.* = .{ .paragraph = paragraph, .move = move };
    return writeGroup(a, tree, sites, locations, owner, &.{owner}, requests, limit, fragmentWriter);
}

pub fn writeGroup(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, owner: usize, owners: []const usize, requests: []const Request, limit: usize, comptime fragmentWriter: anytype) ![]u8 {
    if (owners.len == 0 or owners[0] != owner) return error.InvalidMetadataGroup;
    if (requests.len > tree.elements.len or tree.source.len > limit) return error.LimitExceeded;
    const uri = @import("document_xml.zig").paragraph_uri;
    for (owners, 0..) |candidate, index| {
        if (candidate >= tree.elements.len or !tree.elements[candidate].is(uri, "p")) return error.InvalidParagraphElement;
        if (tree.elements[candidate].parent != tree.elements[owner].parent) return error.CrossParagraphOwner;
        if (index != 0 and tree.elements[owners[index - 1]].next_sibling != candidate) return error.InvalidParagraphAdjacency;
    }
    var groups: std.ArrayList(Group) = .empty;
    defer {
        for (groups.items) |*group| group.positions.deinit(a);
        groups.deinit(a);
    }
    var controls: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer controls.deinit(a);
    var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer indices.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| if (change.serialized_xml) |xml| a.free(xml);
        changes.deinit(a);
    }
    for (requests) |request| {
        const move = request.move;
        if (move.source_element >= tree.elements.len or move.source_control >= tree.elements.len or tree.elements[move.source_element].parent != move.source_control) return error.SourceBindingMismatch;
        const control = tree.elements[move.source_control];
        const run = control.parent orelse return error.CrossParagraphOwner;
        if (!control.is(uri, "ctrl") or !tree.elements[run].is(uri, "run") or tree.elements[run].parent != owner) return error.CrossParagraphOwner;
        if ((try controls.getOrPut(a, move.source_control)).found_existing) return error.DuplicateMetadataControl;
        const destination = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, request.paragraph);
        var allowed = false;
        for (owners) |candidate| if (candidate == destination) {
            allowed = true;
            break;
        };
        if (!allowed) return error.CrossParagraphOwner;
        const target = try @import("column_boundary_target.zig").resolve(a, tree, sites, locations, request.paragraph, move.unit);
        const entry = try indices.getOrPut(a, target.site_index);
        if (!entry.found_existing) {
            entry.value_ptr.* = groups.items.len;
            try groups.append(a, .{ .site = target.site_index });
        }
        try groups.items[entry.value_ptr.*].positions.append(a, .{ .source_element = move.source_element, .unit = target.local_unit });
        try changes.append(a, .{ .start = control.start_tag.start, .end = control.end, .text = "" });
    }
    for (groups.items) |group| {
        const site = sites.items[group.site];
        const rendered = try fragmentWriter(a, tree, site, tree, group.positions.items, limit);
        errdefer a.free(rendered);
        try changes.append(a, .{ .start = site.start, .end = site.end, .text = "", .serialized_xml = rendered });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.source, changes.items, limit);
}

test "metadata group moves page areas only within proven sibling domain" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:header><p:subList><p:p><p:run><p:t>H</p:t></p:run></p:p></p:subList></p:header></p:ctrl><p:ctrl><p:footer><p:subList><p:p><p:run><p:t>F</p:t></p:run></p:p></p:subList></p:footer></p:ctrl><p:t>L</p:t></p:run></p:p><p:p><p:run><p:t>R</p:t></p:run></p:p><p:p><p:run><p:t>outside</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const left = try @import("paragraph_site_owner.zig").resolve(&tree, &sites, locations, 1);
    const right = try @import("paragraph_site_owner.zig").resolve(&tree, &sites, locations, 4);
    const areas = try @import("page_area_source_positions.zig").collect(a, &tree, left, &.{}, 2);
    defer a.free(areas);
    const requests = [_]Request{
        .{ .paragraph = 1, .move = .{ .source_element = areas[0].source_element, .source_control = areas[0].source_control, .unit = 0 } },
        .{ .paragraph = 4, .move = .{ .source_element = areas[1].source_element, .source_control = areas[1].source_control, .unit = 1 } },
    };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree, text: *const Sites, bound: []const Location, owners: []const usize, moves: []const Request) !void {
            const output = try writeGroup(allocator, original, text, bound, owners[0], owners, moves, 10000, @import("page_area_text_xml.zig").writeManyFrom);
            defer allocator.free(output);
            var result = try @import("xml_part_tree.zig").parse(allocator, output, .section, 0, 0, .{});
            defer result.deinit(allocator);
            var current = try @import("text_sites.zig").collect(allocator, &result, .{});
            defer current.deinit(allocator);
            const rows = try @import("text_site_locations.zig").build(allocator, &result, &current, .{});
            defer allocator.free(rows);
            for (result.elements, 0..) |element, index| {
                if (element.is(@import("document_xml.zig").paragraph_uri, "footer")) {
                    const host = try @import("paragraph_site_owner.zig").ancestor(&result, index);
                    try std.testing.expectEqual(host, try @import("paragraph_site_owner.zig").resolve(&result, &current, rows, 3));
                    try std.testing.expectEqualStrings(original.sourceOf(moves[1].move.source_element), result.sourceOf(index));
                }
            }
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:p><p:run><p:t>outside</p:t></p:run></p:p>") != null);
        }
    };
    try Probe.run(a, &tree, &sites, locations, &.{ left, right }, &requests);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &sites, locations, &[_]usize{ left, right }, &requests });
    var outside = requests[1];
    outside.paragraph = 5;
    try std.testing.expectError(error.CrossParagraphOwner, writeGroup(a, &tree, &sites, locations, left, &.{ left, right }, &.{outside}, 10000, @import("page_area_text_xml.zig").writeManyFrom));
    try std.testing.expectError(error.CrossParagraphOwner, writeGroup(a, &tree, &sites, locations, right, &.{right}, requests[1..], 10000, @import("page_area_text_xml.zig").writeManyFrom));
    try std.testing.expectError(error.InvalidParagraphAdjacency, writeGroup(a, &tree, &sites, locations, left, &.{ left, left }, &requests, 10000, @import("page_area_text_xml.zig").writeManyFrom));
    try std.testing.expectEqualStrings(xml, tree.source);
}
