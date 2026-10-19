//! Atomic same-original-paragraph relocation with one replacement per text site.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
const Position = @import("column_boundary_position.zig").Position;
const fragments = @import("column_boundary_text_xml.zig");
const writer = @import("xml_source_writer.zig");
const Group = struct { site: usize, boundaries: std.ArrayList(fragments.Local) = .empty };
pub const Request = struct { paragraph: usize, boundary: Position };

test "column group moves enforce both source and destination owner domains" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p><p:p><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var owners: [3]usize = undefined;
    var count: usize = 0;
    var column: usize = undefined;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
            owners[count] = index;
            count += 1;
        }
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) column = index;
    }
    const request: Request = .{ .paragraph = 1, .boundary = .{ .source_element = column, .unit = 1, .affinity = .right } };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Sites, rows: []const Location, domain: []const usize, move: Request) !void {
            const output = try writeGroupSources(allocator, parsed, current, rows, domain, &.{move}, 10000);
            defer allocator.free(output);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, output, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
            var text = try @import("text_sites.zig").collect(allocator, &reopened, .{});
            defer text.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "colCount="));
            for (reopened.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
                const control = try @import("column_boundary_xml.zig").control(&reopened, index);
                const run_index = reopened.elements[control].parent.?;
                try std.testing.expectEqual(reopened.elements[0].first_child, reopened.elements[run_index].parent);
            };
            var combined: std.ArrayList(u8) = .empty;
            defer combined.deinit(allocator);
            for (text.items) |site| try combined.appendSlice(allocator, site.text);
            try std.testing.expectEqualStrings("ABC", combined.items);
            try std.testing.expectEqualStrings("B", current.items[1].text);
        }
    };
    try Probe.run(a, &tree, &sites, locations, owners[0..2], request);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &sites, locations, owners[0..2], request });
    try std.testing.expectError(error.CrossParagraphOwner, writeGroupSources(a, &tree, &sites, locations, owners[0..1], &.{request}, 10000));
    var outside = request;
    outside.paragraph = 3;
    try std.testing.expectError(error.CrossParagraphOwner, writeGroupSources(a, &tree, &sites, locations, owners[0..2], &.{outside}, 10000));
    try std.testing.expectError(error.SourceBindingMismatch, writeGroupSources(a, &tree, &sites, locations, &.{ owners[0], owners[0] }, &.{request}, 10000));
    try std.testing.expectError(error.InvalidColumnBoundaryGroup, writeGroupSources(a, &tree, &sites, locations, &.{}, &.{request}, 10000));
    try std.testing.expectEqualStrings(xml, tree.source);
}

/// Ordered relocation requests, not a complete authoritative boundary inventory.
/// Uses source-bound sites; other unsaved editor values are not assembled here.
pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, paragraph: usize, boundaries: []const Position, limit: usize) ![]u8 {
    if (boundaries.len > tree.elements.len or tree.source.len > limit) return error.LimitExceeded;
    if (boundaries.len == 0) return a.dupe(u8, tree.source);
    const common = @import("metadata_control_moves.zig");
    const moves = try a.alloc(common.Move, boundaries.len);
    defer a.free(moves);
    for (boundaries, moves) |boundary, *move| move.* = .{ .source_element = boundary.source_element, .source_control = try @import("column_boundary_xml.zig").control(tree, boundary.source_element), .unit = boundary.unit };
    return common.write(a, tree, sites, locations, paragraph, moves, limit, fragments.writeManyFrom) catch |err| return if (err == error.DuplicateMetadataControl) error.DuplicateColumnBoundary else err;
}

/// Group serializers validate the authoritative partition before using this path.
/// Controls come from one source owner; destinations must be sibling paragraphs.
pub fn writeGroup(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, source_owner: usize, requests: []const Request, limit: usize) ![]u8 {
    return writeRequests(a, tree, sites, locations, source_owner, requests, limit, true, &.{});
}

/// The group writer supplies the complete validated current sibling domain.
pub fn writeGroupSources(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, owners: []const usize, requests: []const Request, limit: usize) ![]u8 {
    if (owners.len == 0) return error.InvalidColumnBoundaryGroup;
    for (owners, 0..) |owner, index| {
        if (owner >= tree.elements.len or !tree.elements[owner].is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
        if (tree.elements[owner].parent != tree.elements[owners[0]].parent) return error.CrossParagraphOwner;
        for (owners[0..index]) |previous| if (previous == owner) return error.SourceBindingMismatch;
    }
    return writeRequests(a, tree, sites, locations, owners[0], requests, limit, true, owners);
}

fn writeRequests(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, owner: usize, requests: []const Request, limit: usize, siblings: bool, source_owners: []const usize) ![]u8 {
    if (requests.len > tree.elements.len or tree.source.len > limit) return error.LimitExceeded;
    if (owner >= tree.elements.len or !tree.elements[owner].is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    var sources: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer sources.deinit(a);
    var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer indices.deinit(a);
    var groups: std.ArrayList(Group) = .empty;
    defer {
        for (groups.items) |*group| group.boundaries.deinit(a);
        groups.deinit(a);
    }
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| if (change.serialized_xml) |bytes| a.free(bytes);
        changes.deinit(a);
    }
    var previous: u32 = 0;
    var previous_paragraph: ?usize = null;
    for (requests) |request| {
        const paragraph = request.paragraph;
        const boundary = request.boundary;
        if (previous_paragraph) |before| {
            if (paragraph < before or (paragraph == before and boundary.unit < previous)) return error.InvalidTextPosition;
        }
        previous_paragraph = paragraph;
        previous = boundary.unit;
        if ((try sources.getOrPut(a, boundary.source_element)).found_existing) return error.DuplicateColumnBoundary;
        const control = try @import("column_boundary_xml.zig").control(tree, boundary.source_element);
        const source_run = tree.elements[control].parent.?;
        const source_owner = tree.elements[source_run].parent orelse return error.CrossParagraphOwner;
        if (source_owner != owner) {
            var allowed = false;
            for (source_owners) |candidate| if (candidate == source_owner) {
                allowed = true;
                break;
            };
            if (!allowed) return error.CrossParagraphOwner;
        }
        const destination = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
        if (source_owners.len != 0) {
            var allowed = false;
            for (source_owners) |candidate| if (candidate == destination) {
                allowed = true;
                break;
            };
            if (!allowed) return error.CrossParagraphOwner;
        }
        if (destination != owner and (!siblings or tree.elements[destination].parent != tree.elements[owner].parent)) return error.CrossParagraphOwner;
        const target = try @import("column_boundary_target.zig").resolve(a, tree, sites, locations, paragraph, boundary.unit);
        const entry = try indices.getOrPut(a, target.site_index);
        if (!entry.found_existing) {
            entry.value_ptr.* = groups.items.len;
            try groups.append(a, .{ .site = target.site_index });
        }
        try groups.items[entry.value_ptr.*].boundaries.append(a, .{ .source_element = boundary.source_element, .unit = target.local_unit });
        const node = tree.elements[control];
        try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "" });
    }
    for (groups.items) |group| {
        const site = sites.items[group.site];
        const replacement = try fragments.writeMany(a, tree, site, group.boundaries.items, limit);
        errdefer a.free(replacement);
        try changes.append(a, .{ .start = site.start, .end = site.end, .text = "", .serialized_xml = replacement });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.source, changes.items, limit);
}

test "column boundary moves XML combines coincident settings without duplicate source patches" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>AB</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>CD</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const boundaries = try @import("column_boundary_collect.zig").collect(a, &tree, 1, &.{}, .right, 2);
    defer a.free(boundaries);
    for ([_][2]u32{ .{ 3, 3 }, .{ 1, 3 } }) |units| {
        for (boundaries, units) |*boundary, unit| boundary.unit = unit;
        const output = try write(a, &tree, &sites, locations, 1, boundaries, 10000);
        defer a.free(output);
        var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
        defer reopened.deinit(a);
        var current = try @import("text_sites.zig").collect(a, &reopened, .{});
        defer current.deinit(a);
        const bound = try @import("text_site_locations.zig").build(a, &reopened, &current, .{});
        defer a.free(bound);
        const positions = try @import("anchor_text_positions.zig").build(a, &reopened, &current, bound, 1);
        defer a.free(positions);
        const saved = try @import("column_boundary_collect.zig").collect(a, &reopened, 1, positions, .right, 2);
        defer a.free(saved);
        try std.testing.expectEqual(@as(usize, 2), saved.len);
        for (saved, boundaries, units) |actual, original, unit| {
            try std.testing.expectEqual(unit, actual.unit);
            try std.testing.expectEqualStrings(tree.sourceOf(original.source_element), reopened.sourceOf(actual.source_element));
        }
        var text: std.ArrayList(u8) = .empty;
        defer text.deinit(a);
        for (current.items) |site| try text.appendSlice(a, site.text);
        try std.testing.expectEqualStrings("ABCD", text.items);
        try std.testing.expectError(error.DuplicateColumnBoundary, write(a, &tree, &sites, locations, 1, &.{ boundaries[0], boundaries[0] }, 10000));
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree, original: *const Sites, bound_locations: []const Location, moves: []const Position) !void {
                const result = try write(allocator, parsed, original, bound_locations, 1, moves, 10000);
                defer allocator.free(result);
            }
        }.run, .{ &tree, &sites, locations, boundaries });
    }
    try std.testing.expectEqualStrings(source, tree.source);
}
