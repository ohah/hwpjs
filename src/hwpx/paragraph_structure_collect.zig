//! Use selected scanner ordinals, including paragraphs without text sites.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const sites_mod = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const values = @import("paragraph_structure_values.zig");

pub fn collect(a: std.mem.Allocator, tree: *const Tree, current: *const sites_mod.Sites, locations: []const scanner.Location, options: sites_mod.Options, counters: *scanner.Report) !values.Values {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    if (current.items.len != locations.len) return error.InvalidTextSites;
    const Context = struct {
        a: std.mem.Allocator,
        tree: *const Tree,
        paragraphs: std.ArrayList(values.Paragraph) = .empty,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const boundary = switch (value) {
                .paragraph_start => |item| item,
                else => return,
            };
            const node = try self.tree.startTagIndex(boundary.tag.raw);
            const empty = try self.a.alloc(sites_mod.Site, 0);
            errdefer self.a.free(empty);
            try self.paragraphs.append(self.a, .{ .template_element = node, .source_ordinal = boundary.location.paragraph_ordinal, .sites = .{ .items = empty } });
        }
    };
    var context: Context = .{ .a = a, .tree = tree };
    defer {
        for (context.paragraphs.items) |*paragraph| paragraph.deinit(a);
        context.paragraphs.deinit(a);
    }
    var report = counters.*;
    try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidPartOrdinal, tree.item_index, .{ .branch_policy = options.branch_policy, .max_attribute_bytes = options.max_attribute_bytes, .max_text_bytes = options.max_text_bytes }, &report, .{ .context = &context, .on_event = Context.event });
    // Nested paragraphs can interleave site ordinals: bucket by scanner identity,
    // not contiguous ranges, without rescanning every site for every paragraph.
    var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer indices.deinit(a);
    const buckets = try a.alloc(std.ArrayList(sites_mod.Site), context.paragraphs.items.len);
    for (buckets) |*bucket| bucket.* = .empty;
    defer {
        for (buckets) |*bucket| {
            for (bucket.items) |site| a.free(site.text);
            bucket.deinit(a);
        }
        a.free(buckets);
    }
    for (context.paragraphs.items, 0..) |paragraph, index| {
        const entry = try indices.getOrPut(a, paragraph.source_ordinal.?);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    for (current.items, locations, 0..) |site, location, site_index| {
        const index = indices.get(location.paragraph_ordinal) orelse return error.SourceBindingMismatch;
        const single: sites_mod.Sites = .{ .items = current.items[site_index .. site_index + 1] };
        if (try @import("paragraph_site_owner.zig").resolve(tree, &single, locations[site_index .. site_index + 1], location.paragraph_ordinal) != context.paragraphs.items[index].template_element) return error.SourceBindingMismatch;
        var copy = site;
        copy.text = try a.dupe(u8, site.text);
        errdefer a.free(copy.text);
        try buckets[index].append(a, copy);
    }
    for (context.paragraphs.items, buckets) |*paragraph, *bucket| {
        const rows = try bucket.toOwnedSlice(a);
        paragraph.sites.deinit(a);
        paragraph.sites = .{ .items = rows };
    }
    const result: values.Values = .{ .paragraphs = try context.paragraphs.toOwnedSlice(a) };
    counters.* = report;
    return result;
}

test "HWPX structure collection preserves interleaved nested paragraph sites" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>앞</p:t><p:tbl><p:tr><p:tc><p:subList><p:p id='2'><p:run><p:t>중첩</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:t>뒤</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: scanner.Report = .{};
    var result = try collect(a, &tree, &sites, locations, .{}, &report);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), result.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 2), result.paragraphs[0].sites.items.len);
    try std.testing.expectEqualStrings("앞", result.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("뒤", result.paragraphs[0].sites.items[1].text);
    try std.testing.expectEqualStrings("중첩", result.paragraphs[1].sites.items[0].text);
}

test "HWPX structure collection rejects mismatched ordinals without committing counters" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p/><p:p><p:run><p:t>A</p:t></p:run></p:p></s:sec>", .section, 1, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    var location_counters: scanner.Report = .{ .paragraphs = 7 };
    const locations = try @import("text_site_locations.zig").buildWithCounters(a, &tree, &sites, .{}, &location_counters);
    defer a.free(locations);
    var counters: scanner.Report = .{ .paragraphs = 7 };
    var output = try collect(a, &tree, &sites, locations, .{}, &counters);
    defer output.deinit(a);
    try std.testing.expectEqual(@as(?usize, 8), output.paragraphs[0].source_ordinal);
    try std.testing.expectEqual(@as(?usize, 9), output.paragraphs[1].source_ordinal);
    try std.testing.expectEqual(@as(usize, 9), counters.paragraphs);
    locations[0].paragraph_ordinal = 99;
    counters = .{ .paragraphs = 7 };
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &sites, locations, .{}, &counters));
    try std.testing.expectEqual(@as(usize, 7), counters.paragraphs);
    try std.testing.expectEqualStrings("A", sites.items[0].text);
    const node = output.paragraphs[1].template_element;
    const span = tree.elements[node].start_tag;
    const tag = tree.source[span.start..span.end];
    try std.testing.expectEqual(node, try tree.startTagIndex(tag));
    try std.testing.expectError(error.SourceBindingMismatch, tree.startTagIndex(tag[0 .. tag.len - 1]));
    const foreign = try a.dupe(u8, tag);
    defer a.free(foreign);
    try std.testing.expectError(error.InvalidSourceSpan, tree.startTagIndex(foreign));
}

test "HWPX structure collection includes site-less paragraphs and preserves scanner ordinals on failure" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'/><p:p id='2'><p:run><p:t>현재</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: scanner.Report = .{};
    var result = try collect(a, &tree, &sites, locations, .{}, &counters);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), result.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 0), result.paragraphs[0].sites.items.len);
    try std.testing.expectEqual(@as(?usize, 2), result.paragraphs[1].source_ordinal);
    try std.testing.expectEqualStrings("현재", result.paragraphs[1].sites.items[0].text);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree, current: *const sites_mod.Sites, positions: []const scanner.Location) !void {
            var report: scanner.Report = .{};
            var output = collect(allocator, borrowed, current, positions, .{}, &report) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), report.paragraphs);
                return err;
            };
            defer output.deinit(allocator);
        }
    }.run, .{ &tree, &sites, locations });
}
