const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

test "HWPX field split XML retains each marker once and preserves source metadata" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7' pageBreak='1'><p:run><p:secPr/><p:ctrl><p:colPr/></p:ctrl><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    const paragraph = &current.paragraphs[0];
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: []const Tree, value: *const @import("paragraph_structure_values.zig").Paragraph, linked: *const @import("field_markers.zig").Report, at: u32) !void {
            var draft = try @import("field_split_draft.zig").prepare(allocator, source, 0, value, linked, at, at, 10000, 100);
            defer draft.deinit(allocator);
            const writer = @import("paragraph_split_xml.zig");
            const left = try writer.writeFields(allocator, &source[0], value.template_element, &draft.text.left, .{}, false, 0, draft.markers, 10000);
            defer allocator.free(left);
            const right = try writer.writeFields(allocator, &source[0], value.template_element, &draft.text.right, .{}, true, 8, draft.markers, 10000);
            defer allocator.free(right);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, left, "secPr"));
            try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, right, "secPr"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, left, "colPr"));
            try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, right, "colPr"));
            const root = source[0].elements[0];
            const complete = try std.mem.concat(allocator, u8, &.{ source[0].source[root.start_tag.start..root.start_tag.end], left, right, source[0].source[root.end_tag.?.start..root.end] });
            defer allocator.free(complete);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, complete, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
            const output = [_]Tree{reopened};
            var fields = try @import("field_markers.zig").inspect(allocator, &output, .{});
            defer fields.deinit();
            try std.testing.expectEqual(@as(usize, 1), fields.begins);
            try std.testing.expectEqual(@as(usize, 1), fields.ends);
            try std.testing.expectEqual(@as(usize, 0), fields.unmatched_begins);
            try std.testing.expectEqual(@as(usize, 0), fields.unresolved_ends);
            try std.testing.expectEqual(@as(usize, 0), fields.non_lifo_closures);
            try std.testing.expectEqualStrings(linked.markers[0].raw_xml, fields.markers[0].raw_xml);
            try std.testing.expectEqualStrings(linked.markers[1].raw_xml, fields.markers[1].raw_xml);
        }
    };
    for ([_]u32{ 0, 1, 3, 4 }) |at| try Probe.run(a, &trees, paragraph, &report, at);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &trees, paragraph, &report, @as(u32, 1) });
    var invalid = try @import("field_split_draft.zig").prepare(a, &trees, 0, paragraph, &report, 1, 1, 10000, 100);
    defer invalid.deinit(a);
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeFields(a, &tree, paragraph.template_element, &invalid.text.left, .{}, false, 0, invalid.markers[0..1], 10000));
    const duplicate = [_]@import("field_split_plan.zig").Move{ invalid.markers[0], invalid.markers[0] };
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeFields(a, &tree, paragraph.template_element, &invalid.text.left, .{}, false, 0, &duplicate, 10000));
    const first_marker = invalid.markers[0];
    invalid.markers[0].position.element_index = 0;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_split_xml.zig").writeFields(a, &tree, paragraph.template_element, &invalid.text.left, .{}, false, 0, invalid.markers, 10000));
    invalid.markers[0] = first_marker;
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqualStrings("A😀B", paragraph.sites.items[0].text);
}

test "HWPX field split XML actual marker boundaries preserve complete field links" {
    const a = std.testing.allocator;
    var boundaries: usize = 0;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        const trees = [_]Tree{section.tree};
        var report = try @import("field_markers.zig").inspect(a, &trees, .{});
        defer report.deinit();
        const options = @import("editor_session.zig").siteOptions(session.options);
        var counters: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &counters);
        defer current.deinit(a);
        for (current.paragraphs) |*paragraph| {
            const positions = try @import("field_source_positions.zig").build(a, &trees, 0, paragraph, &report, 100);
            defer a.free(positions);
            for (positions) |position| {
                const at = std.math.cast(u32, position.unit) orelse return error.LimitExceeded;
                var draft = try @import("field_split_draft.zig").prepare(a, &trees, 0, paragraph, &report, at, at, 4_000_000, 100);
                defer draft.deinit(a);
                const writer = @import("paragraph_split_xml.zig");
                const left = try writer.writeFields(a, &section.tree, paragraph.template_element, &draft.text.left, options, false, 0, draft.markers, 4_000_000);
                defer a.free(left);
                const right = try writer.writeFields(a, &section.tree, paragraph.template_element, &draft.text.right, options, true, 100000001, draft.markers, 4_000_000);
                defer a.free(right);
                const replacement = try std.mem.concat(a, u8, &.{ left, right });
                defer a.free(replacement);
                const node = section.tree.elements[paragraph.template_element];
                const xml = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement }}, 4_000_000);
                defer a.free(xml);
                var reopened = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
                defer reopened.deinit(a);
                var output_sites = try @import("text_sites.zig").collect(a, &reopened, options);
                defer output_sites.deinit(a);
                var before_text: std.ArrayList(u8) = .empty;
                defer before_text.deinit(a);
                var after_text: std.ArrayList(u8) = .empty;
                defer after_text.deinit(a);
                for (section.sites.items) |site| try before_text.appendSlice(a, site.text);
                for (output_sites.items) |site| try after_text.appendSlice(a, site.text);
                try std.testing.expectEqualSlices(u8, before_text.items, after_text.items);
                const output = [_]Tree{reopened};
                var linked = try @import("field_markers.zig").inspect(a, &output, .{});
                defer linked.deinit();
                try std.testing.expectEqual(report.markers.len, linked.markers.len);
                try std.testing.expectEqual(@as(usize, 0), linked.duplicate_begin_ids);
                try std.testing.expectEqual(@as(usize, 0), linked.unmatched_begins);
                try std.testing.expectEqual(@as(usize, 0), linked.unresolved_ends);
                try std.testing.expectEqual(@as(usize, 0), linked.non_lifo_closures);
                for (report.markers, linked.markers) |before, after| try std.testing.expectEqualStrings(before.raw_xml, after.raw_xml);
                boundaries += 1;
            }
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
    try std.testing.expectEqual(@as(usize, 12), boundaries);
}
