//! Real-file joined writer verification, before public merge integration.
const std = @import("std");

test "joined column writer retains real file adjacent source settings" {
    const a = std.testing.allocator;
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
        for (0..2) |index| {
            const left = &values.paragraphs[index];
            const right = &values.paragraphs[index + 1];
            const rows = try a.alloc(@import("text_sites.zig").Site, left.sites.items.len + right.sites.items.len);
            defer a.free(rows);
            @memcpy(rows[0..left.sites.items.len], left.sites.items);
            @memcpy(rows[left.sites.items.len..], right.sites.items);
            var pieces = [_]@import("paragraph_joined_values.zig").Piece{
                .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .generated_id = null, .first_site = 0, .site_count = left.sites.items.len },
                .{ .template_element = right.template_element, .source_ordinal = right.source_ordinal, .generated_id = null, .first_site = left.sites.items.len, .site_count = right.sites.items.len },
            };
            var paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .sites = .{ .items = rows }, .pieces = &pieces };
            try @import("column_boundary_joined_materialize.zig").install(a, &section.tree, &paragraph, 100);
            defer a.free(paragraph.column_boundaries.?);
            const output = try @import("column_boundary_joined_xml.zig").write(a, &section.tree, &paragraph, .{}, 1_000_000);
            defer a.free(output);
            var candidate = try @import("paragraph_structure_merge.zig").prepare(a, &section.tree, &values, index, 1_000_000);
            defer candidate.deinit(a);
            try std.testing.expectEqual(values.paragraphs.len - 1, candidate.paragraphs.len);
            const candidate_output = try @import("column_boundary_joined_xml.zig").write(a, &section.tree, &candidate.paragraphs[index], .{}, 1_000_000);
            defer a.free(candidate_output);
            try std.testing.expectEqualStrings(output, candidate_output);
            const full_section = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, .{}, &.{}, 1_000_000);
            defer a.free(full_section);
            var full_tree = try @import("xml_part_tree.zig").parse(a, full_section, .section, 0, 0, .{});
            defer full_tree.deinit(a);
            var full_sites = try @import("text_sites.zig").collect(a, &full_tree, .{});
            defer full_sites.deinit(a);
            const full_locations = try @import("text_site_locations.zig").build(a, &full_tree, &full_sites, .{});
            defer a.free(full_locations);
            var full_report: @import("section_text.zig").Report = .{};
            var full_values = try @import("paragraph_structure_collect.zig").collect(a, &full_tree, &full_sites, full_locations, .{}, &full_report);
            defer full_values.deinit(a);
            try std.testing.expectEqual(candidate.paragraphs.len, full_values.paragraphs.len);
            try std.testing.expectEqual(candidate.paragraphs[index].sites.items.len, full_values.paragraphs[index].sites.items.len);
            var typed = try candidate.clone(a);
            defer typed.deinit(a);
            try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &section.tree, &typed, index, 0, 0, "후😀", 1_000_000));
            for (candidate.paragraphs[index].column_boundaries.?, typed.paragraphs[index].column_boundaries.?) |before, after| {
                const expected = try @import("column_boundary_position.zig").splice(before, 0, 0, 3, std.math.maxInt(u32) - 3);
                try std.testing.expectEqual(expected.unit, after.unit);
            }
            const typed_section = try @import("paragraph_structure_save.zig").write(a, &section.tree, &typed, .{}, &.{}, 1_000_000);
            defer a.free(typed_section);
            try std.testing.expect(std.mem.indexOf(u8, typed_section, "후😀") != null);
            var resplit = try @import("paragraph_structure_split.zig").prepare(a, &section.tree, &typed, index, 1, 1, 4_000_000_000, 1_000_000);
            defer resplit.deinit(a);
            try std.testing.expectEqual(typed.paragraphs.len + 1, resplit.paragraphs.len);
            try @import("column_boundary_joined_group.zig").validate(a, &section.tree, resplit.paragraphs[index .. index + 2]);
            try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &section.tree, &resplit, index, 0, 0, "왼😀", 1_000_000));
            try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &section.tree, &resplit, index + 1, 0, 0, "오😀", 1_000_000));
            var rejoined = try @import("paragraph_structure_merge.zig").prepare(a, &section.tree, &resplit, index, 1_000_000);
            defer rejoined.deinit(a);
            const rejoined_xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &rejoined, .{}, &.{}, 1_000_000);
            defer a.free(rejoined_xml);
            try std.testing.expect(std.mem.indexOf(u8, rejoined_xml, "왼😀") != null);
            try std.testing.expect(std.mem.indexOf(u8, rejoined_xml, "오😀") != null);
            const resplit_xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &resplit, .{}, &.{}, 1_000_000);
            defer a.free(resplit_xml);
            var resplit_tree = try @import("xml_part_tree.zig").parse(a, resplit_xml, .section, 0, 0, .{});
            defer resplit_tree.deinit(a);
            var resplit_sites = try @import("text_sites.zig").collect(a, &resplit_tree, .{});
            defer resplit_sites.deinit(a);
            const resplit_locations = try @import("text_site_locations.zig").build(a, &resplit_tree, &resplit_sites, .{});
            defer a.free(resplit_locations);
            var resplit_report: @import("section_text.zig").Report = .{};
            var resplit_values = try @import("paragraph_structure_collect.zig").collect(a, &resplit_tree, &resplit_sites, resplit_locations, .{}, &resplit_report);
            defer resplit_values.deinit(a);
            try std.testing.expectEqual(resplit.paragraphs.len, resplit_values.paragraphs.len);
            for (resplit_values.paragraphs[index .. index + 2], resplit.paragraphs[index .. index + 2]) |*actual, expected| {
                try @import("column_boundary_materialize.zig").install(a, &resplit_tree, actual, 100);
                try std.testing.expectEqual(expected.column_boundaries.?.len, actual.column_boundaries.?.len);
                for (actual.column_boundaries.?, expected.column_boundaries.?) |one, two| {
                    try std.testing.expectEqual(two.unit, one.unit);
                    try std.testing.expectEqualStrings(section.tree.sourceOf(two.source_element), resplit_tree.sourceOf(one.source_element));
                }
                var expected_text: std.ArrayList(u8) = .empty;
                defer expected_text.deinit(a);
                var actual_text: std.ArrayList(u8) = .empty;
                defer actual_text.deinit(a);
                for (expected.sites.items) |site| try expected_text.appendSlice(a, site.text);
                for (actual.sites.items) |site| try actual_text.appendSlice(a, site.text);
                try std.testing.expectEqualStrings(expected_text.items, actual_text.items);
            }
            var edited = try values.clone(a);
            defer edited.deinit(a);
            try @import("column_boundary_materialize.zig").install(a, &section.tree, &edited.paragraphs[index], section.tree.elements.len);
            const edited_positions = try @import("paragraph_protected_positions.zig").build(a, &section.tree, &edited.paragraphs[index]);
            defer a.free(edited_positions);
            const edited_boundaries = edited.paragraphs[index].column_boundaries.?;
            const last_boundary = edited_boundaries.len - 1;
            const end_unit: u32 = @intCast(edited_positions[edited_positions.len - 1].end_unit);
            edited_boundaries[last_boundary].unit = end_unit;
            var edited_candidate = try @import("paragraph_structure_merge.zig").prepare(a, &section.tree, &edited, index, 1_000_000);
            defer edited_candidate.deinit(a);
            try std.testing.expectEqual(end_unit, edited_candidate.paragraphs[index].column_boundaries.?[last_boundary].unit);
            try std.testing.expectEqual(end_unit, edited_boundaries[last_boundary].unit);
            const relocated = try @import("column_boundary_joined_xml.zig").write(a, &section.tree, &edited_candidate.paragraphs[index], .{}, 1_000_000);
            defer a.free(relocated);
            try std.testing.expectError(error.InvalidParagraphIndex, @import("column_boundary_source_merge.zig").prepare(a, &section.tree, &values, std.math.maxInt(usize), 1_000_000));
            const source_node = section.tree.elements[left.template_element];
            const source_parent = source_node.parent.?;
            const parent_tag = section.tree.source[section.tree.elements[source_parent].start_tag.start..section.tree.elements[source_parent].start_tag.end];
            const parent_end = section.tree.elements[source_parent].end_tag.?;
            const relocated_wrapper = try std.mem.concat(a, u8, &.{ parent_tag, relocated, section.tree.source[parent_end.start..parent_end.end] });
            defer a.free(relocated_wrapper);
            var relocated_tree = try @import("xml_part_tree.zig").parse(a, relocated_wrapper, .section, 0, 0, .{});
            defer relocated_tree.deinit(a);
            var relocated_sites = try @import("text_sites.zig").collect(a, &relocated_tree, .{});
            defer relocated_sites.deinit(a);
            const relocated_locations = try @import("text_site_locations.zig").build(a, &relocated_tree, &relocated_sites, .{});
            defer a.free(relocated_locations);
            const relocated_positions = try @import("anchor_text_positions.zig").build(a, &relocated_tree, &relocated_sites, relocated_locations, 1);
            defer a.free(relocated_positions);
            const relocated_boundaries = try @import("column_boundary_collect.zig").collect(a, &relocated_tree, 1, relocated_positions, .right, 100);
            defer a.free(relocated_boundaries);
            try std.testing.expectEqual(end_unit, relocated_boundaries[last_boundary].unit);
            const wrapper = try std.mem.concat(a, u8, &.{ parent_tag, output, section.tree.source[parent_end.start..parent_end.end] });
            defer a.free(wrapper);
            var tree = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
            defer tree.deinit(a);
            var reopened = try @import("text_sites.zig").collect(a, &tree, .{});
            defer reopened.deinit(a);
            const locations = try @import("text_site_locations.zig").build(a, &tree, &reopened, .{});
            defer a.free(locations);
            const positions = try @import("anchor_text_positions.zig").build(a, &tree, &reopened, locations, 1);
            defer a.free(positions);
            const boundaries = try @import("column_boundary_collect.zig").collect(a, &tree, 1, positions, .right, 100);
            defer a.free(boundaries);
            try std.testing.expectEqual(paragraph.column_boundaries.?.len, boundaries.len);
            for (boundaries, paragraph.column_boundaries.?) |actual, expected| {
                try std.testing.expectEqual(expected.unit, actual.unit);
                try std.testing.expectEqualStrings(section.tree.sourceOf(expected.source_element), tree.sourceOf(actual.source_element));
            }
            try std.testing.expectEqual(left.sites.items.len + right.sites.items.len, reopened.items.len);
            for (reopened.items, rows) |actual, expected| try std.testing.expectEqualStrings(expected.text, actual.text);
        }
    }
}
