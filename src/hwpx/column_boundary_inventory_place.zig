//! Place immutable source controls into current sibling text sites, without runs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
const Position = @import("column_boundary_position.zig").Position;
const fragments = @import("column_boundary_text_xml.zig");
const writer = @import("xml_source_writer.zig");
pub const Request = struct {
    paragraph: usize,
    boundary: Position,
    /// Offsets belong to this transient current tree, not persistent state.
    destination: union(enum) { text, run_gap: struct { run: usize, at: usize } } = .text,
};
const Group = struct { site: usize, boundaries: std.ArrayList(fragments.Local) = .empty };
const Gap = struct { at: usize, bytes: std.ArrayList(u8) = .empty };

/// Destinations must contain no existing column controls. The complete inventory
/// is checked here; source topology and current ownership belong to the caller.
pub fn write(a: std.mem.Allocator, current: *const Tree, sites: *const Sites, locations: []const Location, provenance: *const Tree, inventory: []const Position, requests: []const Request, limit: usize) ![]u8 {
    if (current.source.len > limit or requests.len > provenance.elements.len) return error.LimitExceeded;
    if (inventory.len != requests.len) return error.SourceBindingMismatch;
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer indices.deinit(a);
    var groups: std.ArrayList(Group) = .empty;
    defer {
        for (groups.items) |*group| group.boundaries.deinit(a);
        groups.deinit(a);
    }
    var gaps: std.ArrayList(Gap) = .empty;
    defer {
        for (gaps.items) |*gap| gap.bytes.deinit(a);
        gaps.deinit(a);
    }
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| if (change.serialized_xml) |xml| a.free(xml);
        changes.deinit(a);
    }
    var previous: ?Request = null;
    var first_owner: ?usize = null;
    for (inventory, requests) |expected, request| {
        if (expected.source_element != request.boundary.source_element) return error.SourceBindingMismatch;
        if ((try seen.getOrPut(a, expected.source_element)).found_existing) return error.DuplicateColumnBoundary;
        _ = try @import("column_boundary_xml.zig").control(provenance, expected.source_element);
        if (previous) |before| {
            if (request.paragraph < before.paragraph or (request.paragraph == before.paragraph and request.boundary.unit < before.boundary.unit)) return error.InvalidColumnBoundaryOrder;
        }
        previous = request;
        const owner = try @import("paragraph_site_owner.zig").resolve(current, sites, locations, request.paragraph);
        if (first_owner) |first| {
            if (current.elements[first].parent != current.elements[owner].parent) return error.CrossParagraphOwner;
        } else first_owner = owner;
        const existing = try @import("column_boundary_collect.zig").collect(a, current, owner, &.{}, .right, current.elements.len);
        defer a.free(existing);
        if (existing.len != 0) return error.DuplicateColumnBoundary;
        if (request.destination == .run_gap) {
            const gap = request.destination.run_gap;
            if (gap.run >= current.elements.len) return error.SourceBindingMismatch;
            const run = current.elements[gap.run];
            if (!run.is(@import("document_xml.zig").paragraph_uri, "run") or run.parent != owner) return error.CrossParagraphOwner;
            const ending = run.end_tag orelse return error.UnsupportedColumnBoundaryTarget;
            var allowed = gap.at == run.start_tag.end or gap.at == ending.start;
            var child = run.first_child;
            while (child) |index| {
                const element = current.elements[index];
                if (gap.at == element.start_tag.start or gap.at == element.end) allowed = true;
                child = element.next_sibling;
            }
            if (!allowed) return error.SourceBindingMismatch;
            const positions = try @import("anchor_text_positions.zig").build(a, current, sites, locations, request.paragraph);
            defer a.free(positions);
            var units: usize = 0;
            for (positions) |position| {
                if (position.source_start >= gap.at) break;
                units = position.end_unit;
            }
            if (units != request.boundary.unit) return error.InvalidTextPosition;
            var found: ?usize = null;
            for (gaps.items, 0..) |item, index| if (item.at == gap.at) {
                found = index;
                break;
            };
            if (found == null) {
                found = gaps.items.len;
                try gaps.append(a, .{ .at = gap.at });
            }
            const control = try @import("column_boundary_xml.zig").write(a, provenance, request.boundary, limit);
            defer a.free(control);
            if (control.len > limit -| gaps.items[found.?].bytes.items.len) return error.LimitExceeded;
            try gaps.items[found.?].bytes.appendSlice(a, control);
            continue;
        }
        const target = try @import("column_boundary_target.zig").resolve(a, current, sites, locations, request.paragraph, request.boundary.unit);
        const entry = try indices.getOrPut(a, target.site_index);
        if (!entry.found_existing) {
            entry.value_ptr.* = groups.items.len;
            try groups.append(a, .{ .site = target.site_index });
        }
        try groups.items[entry.value_ptr.*].boundaries.append(a, .{ .source_element = expected.source_element, .unit = target.local_unit });
    }
    for (groups.items) |group| {
        const site = sites.items[group.site];
        const replacement = try fragments.writeManyFrom(a, current, site, provenance, group.boundaries.items, limit);
        defer a.free(replacement);
        var start = site.start;
        var end = site.end;
        var bytes = replacement;
        var normalized: ?[]u8 = null;
        defer if (normalized) |xml| a.free(xml);
        const text = current.elements[site.element_index];
        if (!site.empty_element and group.boundaries.items[0].unit == 0) {
            const ending = text.end_tag orelse return error.SourceBindingMismatch;
            const closing = current.source[ending.start..ending.end];
            if (site.start == text.start_tag.end and site.end == ending.start) {
                if (!std.mem.startsWith(u8, replacement, closing)) return error.SourceBindingMismatch;
                normalized = try std.mem.concat(a, u8, &.{ replacement[closing.len..], closing });
                bytes = normalized.?;
                start = text.start_tag.start;
                end = ending.end;
            }
        }
        const owned = try a.dupe(u8, bytes);
        errdefer a.free(owned);
        try changes.append(a, .{ .start = start, .end = end, .text = "", .serialized_xml = owned });
    }
    for (gaps.items) |*gap| {
        const bytes = try gap.bytes.toOwnedSlice(a);
        errdefer a.free(bytes);
        try changes.append(a, .{ .start = gap.at, .end = gap.at, .text = "", .serialized_xml = bytes });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, current.source, changes.items, limit);
}

test "column inventory placement preserves sibling text and run count through failures" {
    const a = std.testing.allocator;
    const original = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>original</p:t></p:run></p:p></s:sec>";
    const target = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run></p:p><p:p><p:run charPrIDRef='9'><p:t>CD</p:t></p:run></p:p><p:p><p:run><p:t>untouched</p:t></p:run></p:p></s:sec>";
    var source = try @import("xml_part_tree.zig").parse(a, original, .section, 0, 0, .{});
    defer source.deinit(a);
    var current = try @import("xml_part_tree.zig").parse(a, target, .section, 0, 0, .{});
    defer current.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &current, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &current, &sites, .{});
    defer a.free(locations);
    const inventory = try @import("column_boundary_collect.zig").collect(a, &source, 1, &.{}, .right, 2);
    defer a.free(inventory);
    const requests = [_]Request{
        .{ .paragraph = 1, .boundary = .{ .source_element = inventory[0].source_element, .unit = 3, .affinity = .right } },
        .{ .paragraph = 2, .boundary = .{ .source_element = inventory[1].source_element, .unit = 1, .affinity = .right } },
    };
    const output = try write(a, &current, &sites, locations, &source, inventory, &requests, 10000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var runs: usize = 0;
    var columns: usize = 0;
    for (reopened.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "run")) runs += 1;
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
            try std.testing.expectEqualStrings(source.sourceOf(inventory[columns].source_element), reopened.sourceOf(index));
            columns += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 3), runs);
    try std.testing.expectEqual(@as(usize, 2), columns);
    var text = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer text.deinit(a);
    try std.testing.expectEqualStrings("A😀", text.items[0].text);
    try std.testing.expectEqualStrings("B", text.items[1].text);
    try std.testing.expectEqualStrings("C", text.items[2].text);
    try std.testing.expectEqualStrings("D", text.items[3].text);
    try std.testing.expectEqualStrings("untouched", text.items[4].text);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:p><p:run><p:t>untouched</p:t></p:run></p:p>") != null);
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &current, &sites, locations, &source, inventory, requests[0..1], 10000));
    var duplicate = requests;
    duplicate[1].boundary.source_element = inventory[0].source_element;
    try std.testing.expectError(error.DuplicateColumnBoundary, write(a, &current, &sites, locations, &source, &.{ inventory[0], inventory[0] }, &duplicate, 10000));
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, write(a, &current, &sites, locations, &source, &.{ inventory[1], inventory[0] }, &.{ requests[1], requests[0] }, 10000));
    var invalid = requests;
    invalid[0].boundary.unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, write(a, &current, &sites, locations, &source, inventory, &invalid, 10000));
    const saved_locations = try @import("text_site_locations.zig").build(a, &reopened, &text, .{});
    defer a.free(saved_locations);
    try std.testing.expectError(error.DuplicateColumnBoundary, write(a, &reopened, &text, saved_locations, &source, inventory, &requests, 10000));
    try std.testing.expectError(error.LimitExceeded, write(a, &current, &sites, locations, &source, inventory, &requests, target.len));
    var gap_requests = requests;
    for (&gap_requests) |*request| {
        request.paragraph = 1;
        request.boundary.unit = 0;
        request.destination = .{ .run_gap = .{ .run = 2, .at = current.elements[2].start_tag.end } };
    }
    const at_run = try write(a, &current, &sites, locations, &source, inventory, &gap_requests, 10000);
    defer a.free(at_run);
    try std.testing.expect(std.mem.indexOf(u8, at_run, "<p:t>A😀B</p:t>") != null);
    var invalid_gap = gap_requests;
    invalid_gap[0].destination.run_gap.at = sites.items[0].start + 1;
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &current, &sites, locations, &source, inventory, &invalid_gap, 10000));
    invalid_gap = gap_requests;
    invalid_gap[0].boundary.unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, write(a, &current, &sites, locations, &source, inventory, &invalid_gap, 10000));
    invalid_gap = gap_requests;
    invalid_gap[0].destination.run_gap.run = 5;
    try std.testing.expectError(error.CrossParagraphOwner, write(a, &current, &sites, locations, &source, inventory, &invalid_gap, 10000));
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, destination: *const Tree, current_sites: *const Sites, bound: []const Location, provenance: *const Tree, boundaries: []const Position, placements: []const Request) !void {
            const result = try write(allocator, destination, current_sites, bound, provenance, boundaries, placements, 10000);
            defer allocator.free(result);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &current, &sites, locations, &source, inventory, &requests });
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &current, &sites, locations, &source, inventory, &gap_requests });
    try std.testing.expectEqualStrings(original, source.source);
    try std.testing.expectEqualStrings(target, current.source);
}

test "column inventory placement preserves real file text and exposes empty source run projection" {
    const a = std.testing.allocator;
    const uri = @import("document_xml.zig").paragraph_uri;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        var report: @import("section_text.zig").Report = .{};
        var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
        defer values.deinit(a);
        var inventory: std.ArrayList(Position) = .empty;
        defer inventory.deinit(a);
        var requests: std.ArrayList(Request) = .empty;
        defer requests.deinit(a);
        var removals: std.ArrayList(writer.Change) = .empty;
        defer removals.deinit(a);
        for (values.paragraphs, 0..) |*paragraph, index| {
            try @import("column_boundary_materialize.zig").install(a, &section.tree, paragraph, 100);
            for (paragraph.column_boundaries.?) |boundary| {
                try inventory.append(a, boundary);
                try requests.append(a, .{ .paragraph = index + 1, .boundary = boundary });
                const control = try @import("column_boundary_xml.zig").control(&section.tree, boundary.source_element);
                const node = section.tree.elements[control];
                try removals.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "" });
            }
        }
        try std.testing.expectEqual(@as(usize, 3), inventory.items.len);
        const cleared = try writer.write(a, section.tree.source, removals.items, 1_000_000);
        defer a.free(cleared);
        var current = try @import("xml_part_tree.zig").parse(a, cleared, .section, 0, 0, .{});
        defer current.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &current, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &current, &sites, .{});
        defer a.free(locations);
        const preserved_requests = try a.dupe(Request, requests.items);
        defer a.free(preserved_requests);
        var removed_bytes: usize = 0;
        for (removals.items, preserved_requests) |removal, *request| {
            const at = removal.start - removed_bytes;
            var owner_run: ?usize = null;
            for (current.elements, 0..) |element, index| {
                if (!element.is(uri, "run") or element.end_tag == null) continue;
                if (at >= element.start_tag.end and at <= element.end_tag.?.start) owner_run = index;
            }
            request.destination = .{ .run_gap = .{ .run = owner_run orelse return error.SourceBindingMismatch, .at = at } };
            removed_bytes += removal.end - removal.start;
        }
        const preserved = try write(a, &current, &sites, locations, &section.tree, inventory.items, preserved_requests, 1_000_000);
        defer a.free(preserved);
        var expected_changes: std.ArrayList(writer.Change) = .empty;
        defer {
            for (expected_changes.items) |change| a.free(change.serialized_xml.?);
            expected_changes.deinit(a);
        }
        for (removals.items, inventory.items) |removal, boundary| {
            const closed = try @import("column_boundary_xml.zig").write(a, &section.tree, boundary, 10000);
            errdefer a.free(closed);
            try expected_changes.append(a, .{ .start = removal.start, .end = removal.end, .text = "", .serialized_xml = closed });
        }
        const expected = try writer.write(a, section.tree.source, expected_changes.items, 1_000_000);
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, preserved);
        var preserved_tree = try @import("xml_part_tree.zig").parse(a, preserved, .section, 0, 0, .{});
        defer preserved_tree.deinit(a);
        var preserved_sites = try @import("text_sites.zig").collect(a, &preserved_tree, .{});
        defer preserved_sites.deinit(a);
        try std.testing.expectEqual(section.sites.items.len, preserved_sites.items.len);
        for (section.sites.items, preserved_sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
        const output = try write(a, &current, &sites, locations, &section.tree, inventory.items, requests.items, 1_000_000);
        defer a.free(output);
        var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
        defer reopened.deinit(a);
        for ([_][]const u8{ "run", "t" }) |element_name| {
            var before: usize = 0;
            var after: usize = 0;
            for (section.tree.elements) |element| if (element.is(uri, element_name)) {
                before += 1;
            };
            for (reopened.elements) |element| if (element.is(uri, element_name)) {
                after += 1;
            };
            try std.testing.expectEqual(before, after);
        }
        var saved_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
        defer saved_sites.deinit(a);
        const saved_locations = try @import("text_site_locations.zig").build(a, &reopened, &saved_sites, .{});
        defer a.free(saved_locations);
        var saved_report: @import("section_text.zig").Report = .{};
        var saved_values = try @import("paragraph_structure_collect.zig").collect(a, &reopened, &saved_sites, saved_locations, .{}, &saved_report);
        defer saved_values.deinit(a);
        try std.testing.expectEqual(values.paragraphs.len, saved_values.paragraphs.len);
        for (values.paragraphs, saved_values.paragraphs) |before, *after| {
            var original_text: std.ArrayList(u8) = .empty;
            defer original_text.deinit(a);
            var saved_text: std.ArrayList(u8) = .empty;
            defer saved_text.deinit(a);
            for (before.sites.items) |site| try original_text.appendSlice(a, site.text);
            var empty_bindings: usize = 0;
            for (after.sites.items) |site| {
                try saved_text.appendSlice(a, site.text);
                if (site.missing_text and site.text.len == 0) empty_bindings += 1;
            }
            try std.testing.expectEqualStrings(original_text.items, saved_text.items);
            // Removing a metadata-only control can expose a pre-existing empty
            // run as a missing-text site. This is not full XML/run ownership
            // equivalence and must not authorize production group routing.
            try std.testing.expect(after.sites.items.len >= before.sites.items.len);
            try std.testing.expect(after.sites.items.len - before.sites.items.len <= empty_bindings);
            try @import("column_boundary_materialize.zig").install(a, &reopened, after, 100);
            for (before.column_boundaries.?, after.column_boundaries.?) |left, right| {
                try std.testing.expectEqual(left.unit, right.unit);
                try std.testing.expectEqualStrings(section.tree.sourceOf(left.source_element), reopened.sourceOf(right.source_element));
            }
        }
    }
}
