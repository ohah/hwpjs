//! Validate complete source-owner coverage before assembling protected run fragments.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const typed = @import("character_style_anchor_projection.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize) ![]u8 {
    return writeMode(a, tree, sites, run_index, original, current, limit, null, null);
}

pub fn writeOwned(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]u8 {
    return writeMode(a, tree, sites, run_index, original, current, limit, owned, null);
}
pub fn writeTitles(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize, owned: ?[]const @import("paragraph_structure_values.zig").ProtectedPosition, titles: ?[]const @import("title_mark_position.zig").Position) ![]u8 {
    return writeMode(a, tree, sites, run_index, original, current, limit, owned, titles);
}

fn contains(owned: ?[]const @import("paragraph_structure_values.zig").ProtectedPosition, index: usize) bool {
    const items = owned orelse return true;
    for (items) |item| if (item.element_index == index) return true;
    return false;
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, run_index: usize, original: []const typed.Span, current: []const typed.Span, limit: usize, owned: ?[]const @import("paragraph_structure_values.zig").ProtectedPosition, titles: ?[]const @import("title_mark_position.zig").Position) ![]u8 {
    if (run_index >= tree.elements.len or !tree.elements[run_index].is(uri, "run")) return error.SourceBindingMismatch;
    if (!@import("element_whitespace_gaps.zig").empty(tree, run_index)) return error.UnsupportedInlineControl;
    const retained = try @import("character_style_retained_sites.zig").collectOwned(a, tree, run_index, titles);
    defer a.free(retained);
    var expected: usize = 0;
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const owner = if (site.missing_text) site.element_index else tree.elements[site.element_index].parent orelse continue;
        if (owner == run_index) expected += 1;
    }
    var child = tree.elements[run_index].first_child;
    while (child) |index| {
        if (@import("run_anchor.zig").kind(tree, index) != null) {
            if (contains(owned, index)) expected += 1;
        } else if (tree.elements[index].is(uri, "t")) {
            var inline_child = tree.elements[index].first_child;
            while (inline_child) |inline_index| {
                if (@import("title_mark_axis.zig").retained(tree, inline_index)) {
                    inline_child = tree.elements[inline_index].next_sibling;
                    continue;
                }
                if (!@import("retained_inline_unit.zig").supported(tree, inline_index)) return error.UnsupportedInlineControl;
                if (contains(owned, inline_index)) expected += 1;
                inline_child = tree.elements[inline_index].next_sibling;
            }
            const raw = tree.sourceOf(index);
            if (std.mem.indexOf(u8, raw, "<!--") != null or std.mem.indexOf(u8, raw, "<?") != null) return error.UnsupportedInlineControl;
        } else if (!@import("retained_run_metadata.zig").supported(tree, index) and !@import("retained_bookmark.zig").directSupported(tree, index)) return error.UnsupportedInlineControl;
        child = tree.elements[index].next_sibling;
    }
    if (original.len == 0 or original.len != expected) return error.SourceBindingMismatch;
    var owners: std.AutoHashMap(typed.Owner, void) = .init(a);
    defer owners.deinit();
    var cursor = original[0].range.start_unit;
    var next: usize = 0;
    var source_cursor: usize = 0;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var retained_cursor: usize = 0;
    for (original) |base| {
        switch (base.owner) {
            .anchor_element, .tab_element => |index| if (!contains(owned, index)) return error.SourceBindingMismatch,
            .text_site => {},
        }
        if (base.range.start_unit != cursor or base.range.end_unit < cursor) return error.InvalidTextSites;
        const source_index = switch (base.owner) {
            .text_site => |index| block: {
                if (index >= sites.items.len) return error.InvalidTextSites;
                if (try @import("text_site_edit.zig").utf16Length(sites.items[index].text) != base.range.end_unit - cursor) return error.InvalidTextSites;
                break :block sites.items[index].element_index;
            },
            .tab_element, .anchor_element => |index| index,
        };
        if (source_index >= tree.elements.len) return error.SourceBindingMismatch;
        const source = tree.elements[source_index];
        const owner = switch (base.owner) {
            .text_site => |index| if (sites.items[index].missing_text) source_index else source.parent orelse return error.SourceBindingMismatch,
            .tab_element => block: {
                const text = source.parent orelse return error.SourceBindingMismatch;
                break :block tree.elements[text].parent orelse return error.SourceBindingMismatch;
            },
            .anchor_element => source.parent orelse return error.SourceBindingMismatch,
        };
        if (owner != run_index) return error.SourceBindingMismatch;
        const order = switch (base.owner) {
            .text_site => |index| sites.items[index].start,
            else => source.start_tag.start,
        };
        if (order < source_cursor) return error.SourceBindingMismatch;
        source_cursor = order;
        try @import("character_style_retained_emit.zig").before(a, tree, run_index, retained, &retained_cursor, order, &output, limit);
        const entry = try owners.getOrPut(base.owner);
        if (entry.found_existing) return error.SourceBindingMismatch;
        const first = next;
        while (next < current.len and std.meta.eql(current[next].owner, base.owner)) : (next += 1) {
            const span = current[next];
            if (span.range.start_unit != cursor or span.range.end_unit < cursor or span.range.end_unit > base.range.end_unit) return error.InvalidTextSites;
            if (next > first and span.range.end_unit == cursor) return error.InvalidTextSites;
            const fragment = switch (span.owner) {
                .anchor_element => try @import("character_style_anchor_fragment.zig").write(a, tree, span, limit -| output.items.len),
                .text_site => |index| block: {
                    if (sites.items[index].anchor_boundary) break :block try @import("character_style_anchor_boundary_fragment.zig").write(a, tree, sites.items[index], span.range.start_unit - base.range.start_unit, span.range.end_unit - base.range.start_unit, span.range.char_shape_id, limit -| output.items.len);
                    if (sites.items[index].missing_text) {
                        if (span.range.end_unit != cursor or sites.items[index].text.len != 0) return error.UnsupportedTextSite;
                        break :block try a.alloc(u8, 0);
                    }
                    break :block try @import("character_style_tab_fragment.zig").writeForProtectedRun(a, tree, sites, .{ .start_unit = span.range.start_unit, .end_unit = span.range.end_unit, .site_start_unit = base.range.start_unit, .owner = .{ .text_site = index }, .char_shape_id = span.range.char_shape_id }, limit -| output.items.len);
                },
                .tab_element => |index| try @import("character_style_tab_fragment.zig").writeForProtectedRun(a, tree, sites, .{ .start_unit = span.range.start_unit, .end_unit = span.range.end_unit, .site_start_unit = base.range.start_unit, .owner = .{ .tab_element = index }, .char_shape_id = span.range.char_shape_id }, limit -| output.items.len),
            };
            defer a.free(fragment);
            try output.appendSlice(a, fragment);
            cursor = span.range.end_unit;
        }
        if (next == first or cursor != base.range.end_unit) return error.InvalidTextSites;
    }
    if (next != current.len) return error.InvalidTextSites;
    try @import("character_style_retained_emit.zig").before(a, tree, run_index, retained, &retained_cursor, tree.source.len, &output, limit);
    return output.toOwnedSlice(a);
}

test "HWPX protected run assembler retains mixed text and objects and refuses incomplete ownership" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7' custom='keep'><p:t>A😀</p:t><p:rect width='123'><!--opaque--><p:subList><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:subList></p:rect><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var all_sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer all_sites.deinit(a);
    const all_locations = try @import("text_site_locations.zig").build(a, &tree, &all_sites, .{});
    defer a.free(all_locations);
    var rows: std.ArrayList(@import("text_sites.zig").Site) = .empty;
    defer rows.deinit(a);
    var locations: std.ArrayList(@import("section_text.zig").Location) = .empty;
    defer locations.deinit(a);
    for (all_sites.items, all_locations) |site, location| if (location.paragraph_ordinal == 1) {
        try rows.append(a, site);
        try locations.append(a, location);
    };
    const sites: Sites = .{ .items = rows.items };
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, &tree, &sites, locations.items, 1);
    defer a.free(positions);
    const original = try typed.build(a, &tree, &sites, positions, 1000);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 3), original.len);
    const run_index = tree.elements[sites.items[0].element_index].parent.?;
    var current = [_]typed.Span{ original[0], original[0], original[1], original[2] };
    current[0].range.end_unit = 1;
    current[1].range.start_unit = 1;
    current[1].range.char_shape_id = 9;
    current[2].range.char_shape_id = 9;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree, s: *const Sites, index: usize, source: []const typed.Span, selected: []const typed.Span) !void {
            const output = try write(allocator, t, s, index, source, selected, 10000);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, t.sourceOf(source[1].owner.anchor_element)));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "😀"));
            const wrapped = try std.mem.concat(allocator, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", output, "</p:p></s:sec>" });
            defer allocator.free(wrapped);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, wrapped, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
        }
    };
    try Probe.run(a, &tree, &sites, run_index, original, &current);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &sites, run_index, original, &current });
    try std.testing.expectError(error.InvalidTextSites, write(a, &tree, &sites, run_index, original, current[0..3], 10000));
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, &sites, run_index, original[0..2], current[0..3], 10000));
    var invalid = current;
    invalid[0].range.end_unit = 2;
    invalid[1].range.start_unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, write(a, &tree, &sites, run_index, original, &invalid, 10000));
}

test "HWPX protected run assembler covers actual line run including synthetic boundaries" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, &section.tree, &section.sites, section.locations, 1);
    defer a.free(positions);
    const original = try typed.build(a, &section.tree, &section.sites, positions, 1000);
    defer a.free(original);
    var checked: std.AutoHashMap(usize, void) = .init(a);
    defer checked.deinit();
    for (original) |span| switch (span.owner) {
        .anchor_element => |element| {
            const run_index = section.tree.elements[element].parent.?;
            const entry = try checked.getOrPut(run_index);
            if (entry.found_existing) continue;
            var selected: std.ArrayList(typed.Span) = .empty;
            defer selected.deinit(a);
            for (original) |base| {
                const owner = switch (base.owner) {
                    .text_site => |index| if (section.sites.items[index].missing_text) section.sites.items[index].element_index else section.tree.elements[section.sites.items[index].element_index].parent.?,
                    .anchor_element => |index| section.tree.elements[index].parent.?,
                    .tab_element => |index| section.tree.elements[section.tree.elements[index].parent.?].parent.?,
                };
                if (owner == run_index) try selected.append(a, base);
            }
            const current = try a.dupe(typed.Span, selected.items);
            defer a.free(current);
            for (current) |*base| base.range.char_shape_id = 9;
            const output = try write(a, &section.tree, &section.sites, run_index, selected.items, current, 4_000_000);
            defer a.free(output);
            for (selected.items) |base| switch (base.owner) {
                .anchor_element => |index| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, section.tree.sourceOf(index))),
                else => {},
            };
        },
        else => {},
    };
    try std.testing.expect(checked.count() > 0);
}
