//! Compose current UTF16 positions in piece order, not original XML order.
const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const positions = @import("paragraph_text_positions.zig");

test "HWPX joined tabs actual tabdef section preserves every tab after merge and input" {
    try @import("../testing/checked_allocator.zig").run(actualTabdefSplitBoundaries, .{});
}

fn actualTabdefSplitBoundaries(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/tabdef.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
    defer original.deinit(a);
    var split_cases: usize = 0;
    var public_merges: usize = 0;
    var column_merges: usize = 0;
    for (0..original.paragraphs.len - 1) |pair| {
        var public_session = try @import("editor_session.zig").open(a, input, .{});
        defer public_session.deinit();
        const public_index = public_session.sections[0].first_paragraph + pair;
        const public_left = try public_session.anchorText(0, public_index);
        defer a.free(public_left);
        const public_right = try public_session.anchorText(0, public_index + 1);
        defer a.free(public_right);
        const public_expected = try std.mem.concat(a, u8, &.{ public_left, public_right });
        defer a.free(public_expected);
        if (@import("column_boundary_collect.zig").hasForParagraph(&section.tree, original.paragraphs[pair].template_element) or @import("column_boundary_collect.zig").hasForParagraph(&section.tree, original.paragraphs[pair + 1].template_element)) {
            column_merges += 1;
        }
        {
            try std.testing.expect(try public_session.mergeParagraph(0, public_index));
            const public_flows = try @import("paragraph_flow_snapshot.zig").read(a, &public_session, 0);
            defer @import("paragraph_flow_snapshot.zig").free(a, public_flows);
            try std.testing.expectEqual(original.paragraphs.len - 1, public_flows.len);
            const public_text = try public_session.anchorText(0, public_index);
            defer a.free(public_text);
            try std.testing.expectEqualStrings(public_expected, public_text);
            const public_zip = try public_session.save();
            defer a.free(public_zip);
            var public_reopened = try @import("editor_session.zig").open(a, public_zip, .{});
            defer public_reopened.deinit();
            const public_saved_text = try public_reopened.anchorText(0, public_index);
            defer a.free(public_saved_text);
            try std.testing.expectEqualStrings(public_expected, public_saved_text);
            try std.testing.expect(try public_session.canEdit(0, public_index));
            try std.testing.expect(try public_session.splice(0, public_index, 0, 0, "후속😀"));
            const edited_expected = try std.mem.concat(a, u8, &.{ "후속😀", public_expected });
            defer a.free(edited_expected);
            const edited_text = try public_session.anchorText(0, public_index);
            defer a.free(edited_text);
            try std.testing.expectEqualStrings(edited_expected, edited_text);
            const edited_zip = try public_session.save();
            defer a.free(edited_zip);
            try std.testing.expect(try public_session.splitParagraph(0, public_index, 0, 0));
            const split_text = try public_session.anchorText(0, public_index + 1);
            defer a.free(split_text);
            try std.testing.expectEqualStrings(edited_expected, split_text);
            try std.testing.expect(try public_session.mergeParagraph(0, public_index));
            const restored_zip = try public_session.save();
            defer a.free(restored_zip);
            try std.testing.expectEqualSlices(u8, edited_zip, restored_zip);
            public_merges += 1;
        }
        var left = try Joined.fromParagraph(a, &original.paragraphs[pair]);
        defer left.deinit(a);
        var right = try Joined.fromParagraph(a, &original.paragraphs[pair + 1]);
        defer right.deinit(a);
        var duplicate = try right.clone(a);
        defer duplicate.deinit(a);
        duplicate.pieces[0].generated_id = 99;
        duplicate.pieces[0].source_ordinal = null;
        duplicate.pieces[0].owns_source = false;
        try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_joined_merge.zig").prepareWithTabs(a, &section.tree, &right, &duplicate, 4_000_000));
        var merged = try @import("paragraph_joined_merge.zig").prepareWithTabs(a, &section.tree, &left, &right, 4_000_000);
        defer merged.deinit(a);
        try std.testing.expect(try @import("paragraph_joined_splice.zig").spliceWithTabs(a, &section.tree, &merged, 0, 0, "한😀", 4_000_000));
        const output = try @import("paragraph_joined_section.zig").writeWithTabs(a, &section.tree, &merged, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
        defer a.free(output);
        var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
        defer reopened.deinit(a);
        const uri = @import("document_xml.zig").paragraph_uri;
        var before_tabs: usize = 0;
        var after_tabs: usize = 0;
        var before_paragraphs: usize = 0;
        var after_paragraphs: usize = 0;
        for (section.tree.elements) |element| {
            if (element.is(uri, "tab")) before_tabs += 1;
            if (element.is(uri, "p")) before_paragraphs += 1;
        }
        for (reopened.elements) |element| {
            if (element.is(uri, "tab")) after_tabs += 1;
            if (element.is(uri, "p")) after_paragraphs += 1;
        }
        try std.testing.expect(before_tabs > 0);
        try std.testing.expectEqual(before_tabs, after_tabs);
        var next_tab: usize = 0;
        for (section.tree.elements, 0..) |element, index| {
            if (!element.is(uri, "tab")) continue;
            while (next_tab < reopened.elements.len and !reopened.elements[next_tab].is(uri, "tab")) next_tab += 1;
            try std.testing.expect(next_tab < reopened.elements.len);
            try std.testing.expectEqualStrings(section.tree.sourceOf(index), reopened.sourceOf(next_tab));
            next_tab += 1;
        }
        try std.testing.expectEqual(before_paragraphs - 1, after_paragraphs);
        try std.testing.expect(std.mem.indexOf(u8, output, "한😀") != null);
        const projected = try buildWithTabs(a, &section.tree, &merged);
        defer a.free(projected);
        if (pair == 0) {
            var owned_candidate = try @import("column_boundary_source_merge.zig").prepareOwnedTabs(a, &section.tree, &original, 0, 4_000_000);
            defer owned_candidate.deinit(a);
            const owned_saved = try @import("paragraph_structure_save.zig").write(a, &section.tree, &owned_candidate, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
            defer a.free(owned_saved);
            var owned_tree = try @import("xml_part_tree.zig").parse(a, owned_saved, .section, 0, 0, .{});
            defer owned_tree.deinit(a);
            try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &section.tree, &owned_candidate, &owned_tree, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
            var column_candidate = try @import("column_boundary_source_merge.zig").prepareWithTabs(a, &section.tree, &original, 0, 4_000_000);
            defer column_candidate.deinit(a);
            try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceWithTabs(a, &section.tree, &column_candidate.paragraphs[0], 0, 0, "열😀", 4_000_000));
            const full_column_xml = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &section.tree, &column_candidate, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
            defer a.free(full_column_xml);
            try std.testing.expect(std.mem.indexOf(u8, full_column_xml, "열😀") != null);
            var full_column_tree = try @import("xml_part_tree.zig").parse(a, full_column_xml, .section, 0, 0, .{});
            defer full_column_tree.deinit(a);
            var full_column_tabs: usize = 0;
            for (full_column_tree.elements) |element| if (element.is(uri, "tab")) {
                full_column_tabs += 1;
            };
            try std.testing.expectEqual(before_tabs, full_column_tabs);
            const column_view = column_candidate.paragraphs[0].joined().?;
            const column_positions = try buildWithTabs(a, &section.tree, &column_view);
            defer a.free(column_positions);
            var column_tabs: usize = 0;
            for (column_positions) |segment| if (@import("paragraph_text_positions.zig").isInlineUnit(segment)) {
                column_tabs += 1;
            };
            const column_units = column_positions[column_positions.len - 1].end_unit;
            var column_splits: usize = 0;
            for (0..column_units + 1) |at| {
                positions.validateBoundary(&column_view.sites, column_positions, at) catch |err| {
                    if (err == error.SplitSurrogatePair) continue;
                    return err;
                };
                var draft = try @import("column_boundary_joined_tab_split.zig").prepare(a, &section.tree, &column_candidate.paragraphs[0], @intCast(at), @intCast(at), 4_000_000);
                defer draft.deinit(a);
                try std.testing.expectEqual(column_tabs, draft.text.tabs.left.len + draft.text.tabs.right.len);
                try std.testing.expectEqual(column_candidate.paragraphs[0].column_boundaries.?.len, draft.columns.left.len + draft.columns.right.len);
                var values = try @import("column_boundary_joined_tab_split_values.zig").prepare(a, &section.tree, &column_candidate, 0, @intCast(at), @intCast(at), 99, 4_000_000);
                defer values.deinit(a);
                try std.testing.expectEqual(column_candidate.paragraphs.len + 1, values.paragraphs.len);
                try std.testing.expectEqual(column_tabs, values.paragraphs[0].protected_positions.?.len + values.paragraphs[1].protected_positions.?.len);
                try std.testing.expectEqual(column_candidate.paragraphs[0].column_boundaries.?.len, values.paragraphs[0].column_boundaries.?.len + values.paragraphs[1].column_boundaries.?.len);
                const split_section = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &section.tree, &values, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                defer a.free(split_section);
                var split_tree = try @import("xml_part_tree.zig").parse(a, split_section, .section, 0, 0, .{});
                defer split_tree.deinit(a);
                try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &section.tree, &values, &split_tree, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
                for (0..2) |selected_index| {
                    var repeated = try @import("column_boundary_joined_tab_split_values.zig").prepare(a, &section.tree, &values, selected_index, 0, 0, 100, 4_000_000);
                    defer repeated.deinit(a);
                    try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceGroupWithTabs(a, &section.tree, repeated.paragraphs[0..3], selected_index + 1, 0, 0, "후속😀", 4_000_000));
                    const repeated_saved = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &section.tree, &repeated, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                    defer a.free(repeated_saved);
                    var repeated_tree = try @import("xml_part_tree.zig").parse(a, repeated_saved, .section, 0, 0, .{});
                    defer repeated_tree.deinit(a);
                    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &section.tree, &repeated, &repeated_tree, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
                    var remerged = try @import("column_boundary_joined_tab_merge.zig").prepare(a, &section.tree, &repeated, selected_index, 4_000_000);
                    defer remerged.deinit(a);
                    try @import("column_boundary_tab_roundtrip_test.zig").verifyMergedText(a, &section.tree, &repeated.paragraphs[selected_index], &repeated.paragraphs[selected_index + 1], &remerged.paragraphs[selected_index], 4_000_000);
                    const merged_saved = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &section.tree, &remerged, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                    defer a.free(merged_saved);
                    var merged_tree = try @import("xml_part_tree.zig").parse(a, merged_saved, .section, 0, 0, .{});
                    defer merged_tree.deinit(a);
                    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &section.tree, &remerged, &merged_tree, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
                    var complete = try @import("column_boundary_joined_tab_merge.zig").prepare(a, &section.tree, &remerged, 0, 4_000_000);
                    defer complete.deinit(a);
                    try @import("column_boundary_tab_roundtrip_test.zig").verifyMergedText(a, &section.tree, &remerged.paragraphs[0], &remerged.paragraphs[1], &complete.paragraphs[0], 4_000_000);
                    try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceGroupWithTabs(a, &section.tree, complete.paragraphs[0..1], 0, 0, 0, "완료😀", 4_000_000));
                    const complete_saved = try @import("paragraph_structure_save.zig").write(a, &section.tree, &complete, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                    defer a.free(complete_saved);
                    var complete_tree = try @import("xml_part_tree.zig").parse(a, complete_saved, .section, 0, 0, .{});
                    defer complete_tree.deinit(a);
                    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &section.tree, &complete, &complete_tree, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
                }
                var split_tabs: usize = 0;
                var split_columns: usize = 0;
                for (split_tree.elements) |element| {
                    if (element.is(uri, "tab")) split_tabs += 1;
                    if (element.is(uri, "colPr")) split_columns += 1;
                }
                try std.testing.expectEqual(before_tabs, split_tabs);
                try std.testing.expectEqual(column_candidate.paragraphs[0].column_boundaries.?.len, split_columns);
                column_splits += 1;
            }
            std.debug.print("HWPX tabdef column/tab split drafts: {d}\n", .{column_splits});
            for (original.paragraphs[2..]) |paragraph| try std.testing.expect(std.mem.indexOf(u8, full_column_xml, section.tree.sourceOf(paragraph.template_element)) != null);
            var column_owner: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = merged.pieces[0].template_element, .source_ordinal = merged.pieces[0].source_ordinal, .sites = merged.sites, .pieces = merged.pieces };
            try @import("column_boundary_joined_materialize.zig").installWithTabs(a, &section.tree, &column_owner, section.tree.elements.len);
            defer a.free(column_owner.column_boundaries.?);
            const original_pointer = column_owner.column_boundaries.?.ptr;
            try @import("column_boundary_joined_materialize.zig").installWithTabs(a, &section.tree, &column_owner, 0);
            try std.testing.expectEqual(original_pointer, column_owner.column_boundaries.?.ptr);
            const column_xml = try @import("column_boundary_joined_xml.zig").writeWithTabs(a, &section.tree, &column_owner, @import("editor_session.zig").siteOptions(session.options), 4_000_000);
            defer a.free(column_xml);
            const root = section.tree.elements[0];
            const wrapped = try std.mem.concat(a, u8, &.{ section.tree.source[root.start_tag.start..root.start_tag.end], column_xml, section.tree.source[root.end_tag.?.start..root.end_tag.?.end] });
            defer a.free(wrapped);
            var column_tree = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
            defer column_tree.deinit(a);
            var tab_count: usize = 0;
            var column_count: usize = 0;
            var next_source: usize = 0;
            for (column_tree.elements, 0..) |element, index| {
                if (element.is(uri, "colPr")) column_count += 1;
                if (!element.is(uri, "tab")) continue;
                tab_count += 1;
                while (next_source < projected.len and !@import("paragraph_text_positions.zig").isInlineUnit(projected[next_source])) next_source += 1;
                try std.testing.expect(next_source < projected.len);
                try std.testing.expectEqualStrings(section.tree.sourceOf(projected[next_source].index), column_tree.sourceOf(index));
                next_source += 1;
            }
            var expected_tabs: usize = 0;
            for (projected) |segment| if (@import("paragraph_text_positions.zig").isInlineUnit(segment)) {
                expected_tabs += 1;
            };
            try std.testing.expectEqual(expected_tabs, tab_count);
            try std.testing.expectEqual(column_owner.column_boundaries.?.len, column_count);
            var saved_sites = try @import("text_sites.zig").collect(a, &column_tree, @import("editor_session.zig").siteOptions(session.options));
            defer saved_sites.deinit(a);
            var saved_pieces = [_]@import("paragraph_joined_values.zig").Piece{.{ .template_element = column_tree.elements[0].first_child.?, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = saved_sites.items.len }};
            const saved_view: Joined = .{ .pieces = &saved_pieces, .sites = saved_sites };
            const saved_columns = try @import("column_boundary_joined_collect.zig").collectWithTabs(a, &column_tree, &saved_view, 100);
            defer a.free(saved_columns);
            try std.testing.expectEqual(column_owner.column_boundaries.?.len, saved_columns.len);
            for (column_owner.column_boundaries.?, saved_columns) |before, after| {
                try std.testing.expectEqual(before.unit, after.unit);
                try std.testing.expectEqualStrings(section.tree.sourceOf(before.source_element), column_tree.sourceOf(after.source_element));
            }
        }
        const units = projected[projected.len - 1].end_unit;
        for (0..units + 1) |boundary| {
            positions.validateBoundary(&merged.sites, projected, boundary) catch |err| {
                if (err == error.SplitSurrogatePair) continue;
                return err;
            };
            const at: u32 = @intCast(boundary);
            var split = try @import("paragraph_joined_tab_split.zig").prepare(a, &section.tree, &merged, at, at, 4_000_000);
            defer split.deinit(a);
            const generated = try a.dupe(@import("paragraph_joined_values.zig").Piece, merged.pieces);
            defer a.free(generated);
            for (generated) |*piece| {
                piece.generated_id = 99;
                piece.source_ordinal = null;
                piece.owns_source = false;
            }
            const left_view: Joined = .{ .pieces = merged.pieces, .sites = split.text.left };
            const right_view: Joined = .{ .pieces = generated, .sites = split.text.right };
            const options = @import("editor_session.zig").siteOptions(session.options);
            const model_rows = try a.alloc(@import("paragraph_structure_values.zig").Paragraph, original.paragraphs.len - 1);
            defer a.free(model_rows);
            @memcpy(model_rows[0..pair], original.paragraphs[0..pair]);
            model_rows[pair] = original.paragraphs[pair];
            model_rows[pair].sites = merged.sites;
            model_rows[pair].pieces = merged.pieces;
            @memcpy(model_rows[pair + 1 ..], original.paragraphs[pair + 2 ..]);
            const model: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = model_rows };
            var candidate = try @import("paragraph_structure_joined_tab_split.zig").prepare(a, &section.tree, &model, pair, at, at, 99, 4_000_000);
            defer candidate.deinit(a);
            try std.testing.expect(try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &candidate, pair + 1, 0, 0, "재😀", 4_000_000, true));
            const full = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 4_000_000);
            defer a.free(full);
            try std.testing.expect(std.mem.indexOf(u8, full, "재😀") != null);
            if (pair == 0 and boundary == 0) {
                var probe = try @import("editor_session.zig").open(a, input, .{});
                defer probe.deinit();
                probe.sections[0].structure_values = try candidate.clone(a);
                probe.sections[0].sites.deinit(a);
                probe.sections[0].sites = .{ .items = &.{} };
                const paragraph_index = probe.sections[0].first_paragraph + 1;
                try std.testing.expect(try probe.canEdit(0, paragraph_index));
                const current_text = try probe.anchorText(0, paragraph_index);
                defer a.free(current_text);
                try std.testing.expect(std.mem.startsWith(u8, current_text, "재😀"));
                const zip = try probe.save();
                defer a.free(zip);
                var saved_session = try @import("editor_session.zig").open(a, zip, .{});
                defer saved_session.deinit();
                const saved_text = try saved_session.anchorText(0, paragraph_index);
                defer a.free(saved_text);
                try std.testing.expectEqualStrings(current_text, saved_text);
                try std.testing.expect(try probe.splitParagraphAnchored(0, paragraph_index, 0, 0));
                const after_split = try probe.anchorText(0, paragraph_index + 1);
                defer a.free(after_split);
                try std.testing.expectEqualStrings(current_text, after_split);
                const split_zip = try probe.save();
                defer a.free(split_zip);
                var split_session = try @import("editor_session.zig").open(a, split_zip, .{});
                defer split_session.deinit();
                const reopened_split = try split_session.anchorText(0, paragraph_index + 1);
                defer a.free(reopened_split);
                try std.testing.expectEqualStrings(current_text, reopened_split);
            }
            var full_tree = try @import("xml_part_tree.zig").parse(a, full, .section, 0, 0, .{});
            defer full_tree.deinit(a);
            var full_tabs: usize = 0;
            var full_paragraphs: usize = 0;
            for (full_tree.elements) |element| {
                if (element.is(uri, "tab")) full_tabs += 1;
                if (element.is(uri, "p")) full_paragraphs += 1;
            }
            try std.testing.expectEqual(before_tabs, full_tabs);
            try std.testing.expectEqual(before_paragraphs, full_paragraphs);
            var full_tab_index: usize = 0;
            for (section.tree.elements, 0..) |element, index| {
                if (!element.is(uri, "tab")) continue;
                while (full_tab_index < full_tree.elements.len and !full_tree.elements[full_tab_index].is(uri, "tab")) full_tab_index += 1;
                try std.testing.expect(full_tab_index < full_tree.elements.len);
                try std.testing.expectEqualStrings(section.tree.sourceOf(index), full_tree.sourceOf(full_tab_index));
                full_tab_index += 1;
            }
            for (original.paragraphs, 0..) |paragraph, ordinal| {
                if (ordinal == pair or ordinal == pair + 1) continue;
                try std.testing.expect(std.mem.indexOf(u8, full, section.tree.sourceOf(paragraph.template_element)) != null);
            }
            var resplit = try @import("paragraph_structure_joined_tab_split.zig").prepare(a, &section.tree, &candidate, pair + 1, 0, 0, 100, 4_000_000);
            defer resplit.deinit(a);
            const resplit_xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &resplit, options, &.{}, 4_000_000);
            defer a.free(resplit_xml);
            var resplit_tree = try @import("xml_part_tree.zig").parse(a, resplit_xml, .section, 0, 0, .{});
            defer resplit_tree.deinit(a);
            var resplit_tabs: usize = 0;
            var resplit_paragraphs: usize = 0;
            for (resplit_tree.elements) |element| {
                if (element.is(uri, "tab")) resplit_tabs += 1;
                if (element.is(uri, "p")) resplit_paragraphs += 1;
            }
            try std.testing.expectEqual(before_tabs, resplit_tabs);
            try std.testing.expectEqual(before_paragraphs + 1, resplit_paragraphs);
            try std.testing.expect(std.mem.indexOf(u8, resplit_xml, "재😀") != null);
            var remerged = try @import("paragraph_structure_merge.zig").prepare(a, &section.tree, &resplit, pair + 1, 4_000_000);
            defer remerged.deinit(a);
            const remerged_xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &remerged, options, &.{}, 4_000_000);
            defer a.free(remerged_xml);
            try std.testing.expectEqualStrings(full, remerged_xml);
            const left_xml = try @import("paragraph_joined_xml.zig").writeOwnedTabs(a, &section.tree, &left_view, options, 4_000_000, split.tabs.left);
            defer a.free(left_xml);
            const right_xml = try @import("paragraph_joined_xml.zig").writeOwnedTabs(a, &section.tree, &right_view, options, 4_000_000, split.tabs.right);
            defer a.free(right_xml);
            const root = section.tree.elements[0];
            const close = root.end_tag.?;
            const wrapper = try std.mem.concat(a, u8, &.{ section.tree.source[root.start_tag.start..root.start_tag.end], left_xml, right_xml, section.tree.source[close.start..close.end] });
            defer a.free(wrapper);
            var partitioned = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
            defer partitioned.deinit(a);
            var owned_tabs: usize = 0;
            for (partitioned.elements) |element| if (element.is(uri, "tab")) {
                owned_tabs += 1;
            };
            try std.testing.expectEqual(split.tabs.left.len + split.tabs.right.len, owned_tabs);
            var next_original: usize = 0;
            for (partitioned.elements, 0..) |element, index| {
                if (!element.is(uri, "tab")) continue;
                while (next_original < projected.len and !@import("paragraph_text_positions.zig").isInlineUnit(projected[next_original])) next_original += 1;
                try std.testing.expect(next_original < projected.len);
                try std.testing.expectEqualStrings(section.tree.sourceOf(projected[next_original].index), partitioned.sourceOf(index));
                next_original += 1;
            }
            var decoded = try @import("text_sites.zig").collect(a, &partitioned, options);
            defer decoded.deinit(a);
            const locations = try @import("text_site_locations.zig").build(a, &partitioned, &decoded, options);
            defer a.free(locations);
            var counters: @import("section_text.zig").Report = .{};
            var rows = try @import("paragraph_structure_collect.zig").collect(a, &partitioned, &decoded, locations, options, &counters);
            defer rows.deinit(a);
            try std.testing.expectEqual(@as(usize, 2), rows.paragraphs.len);
            var expected: std.ArrayList(u8) = .empty;
            defer expected.deinit(a);
            for (projected) |segment| try expected.appendSlice(a, positions.segmentText(&merged.sites, segment));
            var actual: std.ArrayList(u8) = .empty;
            defer actual.deinit(a);
            for (rows.paragraphs) |*paragraph| {
                const text = try @import("paragraph_protected_positions.zig").text(a, &partitioned, paragraph, 4_000_000);
                defer a.free(text);
                try actual.appendSlice(a, text);
            }
            try std.testing.expectEqualStrings(expected.items, actual.items);
            split_cases += 1;
        }
    }
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, input, unchanged);
    std.debug.print("HWPX tabdef owned split boundaries: {d}\n", .{split_cases});
    std.debug.print("HWPX tabdef Session source merges: {d}, including column/tab merges: {d}\n", .{ public_merges, column_merges });
}

pub fn build(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined) ![]positions.Segment {
    return buildMode(a, tree, current, false, false, false);
}

pub fn buildWithTabs(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined) ![]positions.Segment {
    return buildMode(a, tree, current, true, false, false);
}

/// 객체 호스트 병합을 위한 위치 투영입니다. 저장이나 병합 허용을 뜻하지 않습니다.
pub fn buildWithAnchors(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined) ![]positions.Segment {
    return buildMode(a, tree, current, true, true, false);
}

/// 필드 마커는 폭 없이 보존하며 텍스트만 출처 순서의 현재 좌표로 연결합니다.
/// 마커 소유권·연결·병합/저장 권한은 호출자가 별도로 검증해야 합니다.
pub fn buildWithFields(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined) ![]positions.Segment {
    return buildMode(a, tree, current, false, false, true);
}

/// 분할 후 실제 소유한 탭만 현재 문단 위치에 투영합니다.
pub fn buildOwnedTabs(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]positions.Segment {
    return buildOwnedMode(a, tree, current, owned, false);
}

pub fn buildOwnedAnchors(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition) ![]positions.Segment {
    return buildOwnedMode(a, tree, current, owned, true);
}

fn buildOwnedMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, owned: []const @import("paragraph_structure_values.zig").ProtectedPosition, anchors: bool) ![]positions.Segment {
    var parts = if (anchors) try @import("paragraph_joined_tab_partition.zig").buildWithAnchors(a, tree, current, owned) else try @import("paragraph_joined_tab_partition.zig").build(a, tree, current, owned);
    defer parts.deinit(a);
    var result: std.ArrayList(positions.Segment) = .empty;
    defer result.deinit(a);
    var base: usize = 0;
    for (current.pieces, 0..) |piece, index| {
        var paragraph = try current.paragraph(index);
        paragraph.protected_positions = parts.items[index];
        const local = try @import("paragraph_protected_positions.zig").buildSingle(a, tree, &paragraph);
        defer a.free(local);
        for (local) |segment| {
            var projected = segment;
            if (segment.kind == .text) projected.index = std.math.add(usize, piece.first_site, segment.index) catch return error.LimitExceeded;
            projected.start_unit = std.math.add(usize, base, segment.start_unit) catch return error.LimitExceeded;
            projected.end_unit = std.math.add(usize, base, segment.end_unit) catch return error.LimitExceeded;
            try result.append(a, projected);
        }
        if (local.len != 0) base = std.math.add(usize, base, local[local.len - 1].end_unit) catch return error.LimitExceeded;
    }
    return result.toOwnedSlice(a);
}

fn buildMode(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const Joined, allow_tabs: bool, allow_anchors: bool, allow_fields: bool) ![]positions.Segment {
    try current.validate();
    var result: std.ArrayList(positions.Segment) = .empty;
    defer result.deinit(a);
    var units: usize = 0;
    for (current.pieces, 0..) |piece, index| {
        if (piece.output == .inventory_only or piece.template_only) continue;
        const paragraph = try current.paragraph(index);
        try @import("paragraph_structure_policy.zig").validate(a, tree, paragraph.template_element);
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, &paragraph);
        defer a.free(locations);
        if (allow_fields) try @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, &paragraph.sites, locations, 1) else if (allow_anchors) try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, &paragraph.sites, locations, 1) else try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, allow_tabs);
        const local = if (allow_anchors) try @import("anchor_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1) else try positions.build(a, tree, &paragraph.sites, locations, 1);
        defer a.free(local);
        for (local) |segment| {
            if (segment.kind != .text and !(allow_tabs and @import("paragraph_text_positions.zig").isInlineUnit(segment)) and !(allow_anchors and segment.kind == .anchor)) return error.UnsupportedInlineControl;
            var projected = segment;
            if (segment.kind == .text) projected.index = std.math.add(usize, piece.first_site, segment.index) catch return error.LimitExceeded;
            projected.start_unit = std.math.add(usize, units, segment.start_unit) catch return error.LimitExceeded;
            projected.end_unit = std.math.add(usize, units, segment.end_unit) catch return error.LimitExceeded;
            try result.append(a, projected);
        }
        if (local.len != 0) units = std.math.add(usize, units, local[local.len - 1].end_unit) catch return error.LimitExceeded;
    }
    if (allow_tabs) try validateTabIdentities(a, result.items);
    if (allow_anchors) {
        var identities: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer identities.deinit(a);
        for (result.items) |segment| if (segment.kind == .anchor) {
            if ((try identities.getOrPut(a, segment.index)).found_existing) return error.SourceBindingMismatch;
        };
    }
    return result.toOwnedSlice(a);
}

pub fn validateTabIdentities(a: std.mem.Allocator, segments: []const positions.Segment) !void {
    var identities: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer identities.deinit(a);
    for (segments) |segment| if (@import("paragraph_text_positions.zig").isInlineUnit(segment)) {
        if ((try identities.getOrPut(a, segment.index)).found_existing) return error.SourceBindingMismatch;
    };
}

test "HWPX joined anchor projection retains identity Unicode and allocation safety" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:pic/></p:run></p:p><p:p><p:run><p:t>😀</p:t><p:rect/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var pieces: [2]@import("paragraph_joined_values.zig").Piece = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        if (count >= pieces.len) return error.UnexpectedParagraphCount;
        pieces[count] = .{ .template_element = index, .source_ordinal = count + 1, .generated_id = null, .first_site = count, .site_count = 1 };
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    const joined: Joined = .{ .pieces = &pieces, .sites = sites };
    const first = try joined.paragraph(0);
    const second = try joined.paragraph(1);
    var left = try Joined.fromParagraph(a, &first);
    defer left.deinit(a);
    var right = try Joined.fromParagraph(a, &second);
    defer right.deinit(a);
    try std.testing.expectError(error.InvalidParagraphAdjacency, @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &right, &left, 10000));
    try std.testing.expectError(error.InvalidParagraphAdjacency, @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &left, &left, 10000));
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &left, &right, 1));
    var merged = try @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &left, &right, 10000);
    defer merged.deinit(a);
    const merge_projection = try buildWithAnchors(a, &tree, &merged);
    defer a.free(merge_projection);
    try std.testing.expectError(error.UnsupportedParagraphControl, buildWithTabs(a, &tree, &joined));
    const mapped = try buildWithAnchors(a, &tree, &joined);
    defer a.free(mapped);
    try std.testing.expectEqualSlices(positions.Segment, mapped, merge_projection);
    try std.testing.expectEqual(@as(usize, 4), mapped.len);
    try std.testing.expectEqual(.anchor, mapped[1].kind);
    try std.testing.expectEqual(.anchor, mapped[3].kind);
    try std.testing.expectEqual(@as(usize, 1), mapped[1].start_unit);
    try std.testing.expectEqual(@as(usize, 4), mapped[3].start_unit);
    try std.testing.expectEqual(@as(usize, 1), mapped[2].index);
    try std.testing.expect(mapped[1].index != mapped[3].index);
    try std.testing.expectError(error.SplitSurrogatePair, positions.validateBoundary(&sites, mapped, 3));
    try std.testing.expectError(error.ProtectedInlineControl, positions.validateRange(mapped, 1, 2));
    const owned = try @import("paragraph_protected_positions.zig").side(a, mapped, 0, 0, true);
    defer a.free(owned);
    const owned_projection = try buildOwnedAnchors(a, &tree, &joined, owned);
    defer a.free(owned_projection);
    try std.testing.expectEqualSlices(positions.Segment, mapped, owned_projection);
    const xml = try @import("paragraph_joined_xml.zig").writeOwnedAnchors(a, &tree, &joined, .{}, 10000, owned);
    defer a.free(xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "<p:pic/>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "<p:rect/>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "<p:p>"));
    try std.testing.expect(std.mem.indexOf(u8, xml, "A") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "😀") != null);
    // 객체를 오른쪽 조각으로 옮겼다면 이전 조각에서 다시 나타나면 안 됩니다.
    var retained = [_]@import("paragraph_structure_values.zig").ProtectedPosition{owned[1]};
    retained[0].unit -= 1;
    const reduced = try buildOwnedAnchors(a, &tree, &joined, &retained);
    defer a.free(reduced);
    try std.testing.expectEqual(@as(usize, 3), reduced.len);
    try std.testing.expectEqual(@as(usize, 3), reduced[2].start_unit);
    retained[0].kind = .tab;
    try std.testing.expectError(error.SourceBindingMismatch, buildOwnedAnchors(a, &tree, &joined, &retained));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, value: *const Joined) !void {
            const first_source = try value.paragraph(0);
            const second_source = try value.paragraph(1);
            var one = try Joined.fromParagraph(allocator, &first_source);
            defer one.deinit(allocator);
            var two = try Joined.fromParagraph(allocator, &second_source);
            defer two.deinit(allocator);
            var candidate = try @import("paragraph_joined_merge.zig").prepareWithAnchors(allocator, parsed, &one, &two, 10000);
            defer candidate.deinit(allocator);
            const result = try buildWithAnchors(allocator, parsed, &candidate);
            defer allocator.free(result);
            try std.testing.expectEqual(@as(usize, 5), result[result.len - 1].end_unit);
            const all = try @import("paragraph_protected_positions.zig").side(allocator, result, 0, 0, true);
            defer allocator.free(all);
            const owned_result = try buildOwnedAnchors(allocator, parsed, &candidate, all);
            defer allocator.free(owned_result);
            try std.testing.expectEqualSlices(positions.Segment, result, owned_result);
            const saved = try @import("paragraph_joined_xml.zig").writeOwnedAnchors(allocator, parsed, &candidate, .{}, 10000, all);
            defer allocator.free(saved);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:pic/>"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:rect/>"));
        }
    }.run, .{ &tree, &joined });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX joined tab positions retain XML identity and protected UTF16 boundaries" {
    try @import("../testing/checked_allocator.zig").run(joinedTabPositionsRegression, .{});
}
fn joinedTabPositionsRegression(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p><p:p><p:run><p:t>😀<p:tab width='100'/>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, 2);
    var found: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        pieces[found] = .{ .template_element = index, .source_ordinal = found + 1, .generated_id = null, .first_site = if (found == 0) 0 else 1, .site_count = if (found == 0) 1 else 2 };
        found += 1;
    };
    var joined: Joined = .{ .pieces = pieces, .sites = try sites.clone(a) };
    defer joined.deinit(a);
    try std.testing.expectError(error.UnsupportedInlineControl, build(a, &tree, &joined));
    const mapped = try buildWithTabs(a, &tree, &joined);
    defer a.free(mapped);
    try std.testing.expectEqual(@as(usize, 4), mapped.len);
    try std.testing.expectEqual(@as(usize, 3), mapped[2].start_unit);
    try std.testing.expectEqual(@as(usize, 4), mapped[2].end_unit);
    try std.testing.expectEqual(@as(usize, 2), mapped[3].index);
    try std.testing.expect(tree.elements[mapped[2].index].is(@import("document_xml.zig").paragraph_uri, "tab"));
    try std.testing.expectError(error.ProtectedInlineControl, positions.validateRange(mapped, 3, 4));
    try std.testing.expectError(error.SplitSurrogatePair, positions.validateBoundary(&joined.sites, mapped, 2));
    try positions.validateBoundary(&joined.sites, mapped, 3);
    try positions.validateBoundary(&joined.sites, mapped, 4);
    try std.testing.expectError(error.ProtectedInlineControl, @import("paragraph_joined_splice.zig").spliceWithTabs(a, &tree, &joined, 3, 1, "", 10000));
    try std.testing.expectEqualStrings("B", joined.sites.items[2].text);
    try std.testing.expect(try @import("paragraph_joined_splice.zig").spliceWithTabs(a, &tree, &joined, 4, 0, "한😀", 10000));
    try std.testing.expectEqualStrings("한😀B", joined.sites.items[2].text);
    const edited = try buildWithTabs(a, &tree, &joined);
    defer a.free(edited);
    try std.testing.expectEqual(@as(usize, 8), edited[3].end_unit);
    try std.testing.expectEqual(mapped[2].index, edited[2].index);
    const right = try joined.paragraph(1);
    const run_index = tree.elements[right.template_element].first_child.?;
    try std.testing.expectError(error.UnsupportedInlineControl, @import("run_current_xml.zig").write(a, &tree, &right, run_index, .{}, 10000));
    const serialized = try @import("run_current_xml.zig").writeWithTabs(a, &tree, &right, run_index, .{}, 10000, false);
    defer a.free(serialized);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, serialized, "<p:tab width='100'/>"));
    try std.testing.expect(std.mem.indexOf(u8, serialized, "한😀B") != null);
    const merged_xml = try @import("paragraph_joined_xml.zig").writeWithTabs(a, &tree, &joined, .{}, 10000);
    defer a.free(merged_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, merged_xml, "<p:p>"));
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, merged_xml, "<p:run"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, merged_xml, "<p:tab width='100'/>"));
    try std.testing.expect(std.mem.indexOf(u8, merged_xml, "한😀B") != null);
    var before_tab = try @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 3, 3);
    defer before_tab.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), before_tab.left.len);
    try std.testing.expectEqual(@as(usize, 1), before_tab.right.len);
    try std.testing.expectEqual(@as(usize, 0), before_tab.right[0].unit);
    try std.testing.expectEqual(mapped[2].index, before_tab.right[0].element_index);
    var after_tab = try @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 4, 4);
    defer after_tab.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), after_tab.left.len);
    try std.testing.expectEqual(@as(usize, 0), after_tab.right.len);
    try std.testing.expectError(error.ProtectedInlineControl, @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 3, 4));
    try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 2, 2));
    for ([_]u32{ 0, 1, 3, 4, 5, 7, 8 }) |boundary| {
        var plan = try @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, boundary, boundary);
        defer plan.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), plan.left.len + plan.right.len);
        if (boundary <= 3) {
            try std.testing.expectEqual(@as(usize, 3 - boundary), plan.right[0].unit);
        } else {
            try std.testing.expectEqual(@as(usize, 3), plan.left[0].unit);
        }
    }
    var deleted_text = try @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 1, 3);
    defer deleted_text.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), deleted_text.right[0].unit);
    var duplicate_tabs: [5]positions.Segment = undefined;
    @memcpy(duplicate_tabs[0..4], edited);
    duplicate_tabs[4] = edited[2];
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_joined_tab_split_plan.zig").fromPositions(a, &joined, &duplicate_tabs, 3, 3));
    try std.testing.expectError(error.InvalidTextPosition, @import("paragraph_joined_tab_split_plan.zig").build(a, &tree, &joined, 9, 9));
    var tab_draft = try @import("paragraph_joined_tab_split.zig").prepare(a, &tree, &joined, 3, 3, 10000);
    defer tab_draft.deinit(a);
    try std.testing.expectEqualStrings("A", tab_draft.text.left.items[0].text);
    try std.testing.expectEqualStrings("😀", tab_draft.text.left.items[1].text);
    try std.testing.expectEqualStrings("", tab_draft.text.left.items[2].text);
    try std.testing.expectEqualStrings("한😀B", tab_draft.text.right.items[2].text);
    try std.testing.expectEqual(@as(usize, 0), tab_draft.tabs.left.len);
    try std.testing.expectEqual(@as(usize, 1), tab_draft.tabs.right.len);
    var model_rows = [_]@import("paragraph_structure_values.zig").Paragraph{.{ .template_element = joined.pieces[0].template_element, .source_ordinal = joined.pieces[0].source_ordinal, .generated_id = joined.pieces[0].generated_id, .sites = joined.sites, .pieces = joined.pieces }};
    const current_model: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &model_rows };
    var candidate = try @import("paragraph_structure_joined_tab_split.zig").prepare(a, &tree, &current_model, 0, 3, 3, 2, 10000);
    defer candidate.deinit(a);
    const saved_candidate = try @import("paragraph_structure_save.zig").write(a, &tree, &candidate, .{}, &.{}, 10000);
    defer a.free(saved_candidate);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved_candidate, "<p:tab width='100'/>"));
    var parsed_candidate = try @import("xml_part_tree.zig").parse(a, saved_candidate, .section, 0, 0, .{});
    defer parsed_candidate.deinit(a);
    {
        const original_owners = candidate.paragraphs[1].protected_positions;
        defer candidate.paragraphs[1].protected_positions = original_owners;
        candidate.paragraphs[1].protected_positions = &.{};
        try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &candidate, .{}, &.{}, 10000));
    }
    try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 0), candidate.paragraphs[0].protected_positions.?.len);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[1].protected_positions.?.len);
    try std.testing.expectEqual(@as(?u32, 2), candidate.paragraphs[1].generated_id);
    var repeated = try @import("paragraph_structure_joined_tab_split.zig").prepare(a, &tree, &candidate, 1, 1, 1, 3, 10000);
    defer repeated.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), repeated.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 1), repeated.paragraphs[1].protected_positions.?.len);
    try std.testing.expectEqual(@as(usize, 0), repeated.paragraphs[2].protected_positions.?.len);
    const repeated_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &repeated, .{}, &.{}, 10000);
    defer a.free(repeated_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, repeated_xml, "<p:tab width='100'/>"));
    try std.testing.expect(std.mem.indexOf(u8, repeated_xml, "한😀B") != null);
    var remerged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &repeated, 1, 10000);
    defer remerged.deinit(a);
    const remerged_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &remerged, .{}, &.{}, 10000);
    defer a.free(remerged_xml);
    try std.testing.expectEqualStrings(saved_candidate, remerged_xml);
    for (candidate.paragraphs, 0..) |paragraph, side| {
        const view = paragraph.joined().?;
        const current_positions = try buildOwnedTabs(a, &tree, &view, paragraph.protected_positions.?);
        defer a.free(current_positions);
        var spelling: std.ArrayList(u8) = .empty;
        defer spelling.deinit(a);
        for (current_positions) |segment| try spelling.appendSlice(a, positions.segmentText(&view.sites, segment));
        try std.testing.expectEqualStrings(if (side == 0) "A😀" else "\t한😀B", spelling.items);
    }
    {
        const owned = candidate.paragraphs[1].protected_positions.?;
        const before = owned[0];
        defer owned[0] = before;
        owned[0].unit += 1;
        try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &candidate, .{}, &.{}, 10000));
    }
    {
        const before = candidate.paragraphs[0].protected_positions;
        defer candidate.paragraphs[0].protected_positions = before;
        var duplicate_owner = [_]@import("paragraph_structure_values.zig").ProtectedPosition{candidate.paragraphs[1].protected_positions.?[0]};
        duplicate_owner[0].unit = 3;
        candidate.paragraphs[0].protected_positions = &duplicate_owner;
        try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &candidate, .{}, &.{}, 10000));
    }
    var cloned_candidate = try candidate.clone(a);
    defer cloned_candidate.deinit(a);
    try std.testing.expectEqualDeep(candidate.paragraphs[1].protected_positions.?, cloned_candidate.paragraphs[1].protected_positions.?);
    try std.testing.expectError(error.ProtectedInlineControl, @import("paragraph_structure_splice.zig").spliceMode(a, &tree, &cloned_candidate, 1, 0, 1, "", 10000, true));
    try std.testing.expect(try @import("paragraph_structure_splice.zig").spliceMode(a, &tree, &cloned_candidate, 1, 1, 0, "후속", 10000, true));
    try std.testing.expect(try @import("paragraph_structure_splice.zig").spliceMode(a, &tree, &cloned_candidate, 1, 0, 0, "앞", 10000, true));
    try std.testing.expectEqual(@as(usize, 1), cloned_candidate.paragraphs[1].protected_positions.?[0].unit);
    const edited_candidate = try @import("paragraph_structure_save.zig").write(a, &tree, &cloned_candidate, .{}, &.{}, 10000);
    defer a.free(edited_candidate);
    try std.testing.expect(std.mem.indexOf(u8, edited_candidate, "후속한😀B") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, edited_candidate, "<p:tab width='100'/>"));
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_structure_joined_tab_split.zig").prepare(a, &tree, &current_model, 0, 3, 3, 2, 1));
    const right_view: Joined = .{ .pieces = joined.pieces, .sites = tab_draft.text.right };
    const left_view: Joined = .{ .pieces = joined.pieces, .sites = tab_draft.text.left };
    const left_output = try @import("paragraph_joined_xml.zig").writeOwnedTabs(a, &tree, &left_view, .{}, 10000, tab_draft.tabs.left);
    defer a.free(left_output);
    const right_output = try @import("paragraph_joined_xml.zig").writeOwnedTabs(a, &tree, &right_view, .{}, 10000, tab_draft.tabs.right);
    defer a.free(right_output);
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, left_output, "<p:tab"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, right_output, "<p:tab width='100'/>"));
    try std.testing.expect(std.mem.indexOf(u8, right_output, "한😀B") != null);
    var right_parts = try @import("paragraph_joined_tab_partition.zig").build(a, &tree, &right_view, tab_draft.tabs.right);
    defer right_parts.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), right_parts.items[0].len);
    try std.testing.expectEqual(@as(usize, 1), right_parts.items[1].len);
    try std.testing.expectEqual(@as(usize, 0), right_parts.items[1][0].unit);
    var right_paragraph = try right_view.paragraph(1);
    right_paragraph.generated_id = 2;
    right_paragraph.source_ordinal = null;
    right_paragraph.protected_positions = right_parts.items[1];
    const right_xml = try @import("paragraph_split_xml.zig").writeProtected(a, &tree, &right_paragraph, .{}, 10000);
    defer a.free(right_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, right_xml, "<p:tab width='100'/>"));
    try std.testing.expect(std.mem.indexOf(u8, right_xml, "한😀B") != null);
    const duplicates = [_]@import("paragraph_structure_values.zig").ProtectedPosition{ tab_draft.tabs.right[0], tab_draft.tabs.right[0] };
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_joined_tab_partition.zig").build(a, &tree, &right_view, &duplicates));
    var invalid_owner = [_]@import("paragraph_structure_values.zig").ProtectedPosition{tab_draft.tabs.right[0]};
    invalid_owner[0].unit += 1;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_joined_tab_partition.zig").build(a, &tree, &right_view, &invalid_owner));
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const Joined) !void {
            const output = try buildWithTabs(allocator, parsed, current);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &joined });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const Joined) !void {
            var draft = try current.clone(allocator);
            defer draft.deinit(allocator);
            _ = try @import("paragraph_joined_splice.zig").spliceWithTabs(allocator, parsed, &draft, 4, 0, "Z", 10000);
            const paragraph = try draft.paragraph(1);
            const xml = try @import("run_current_xml.zig").writeWithTabs(allocator, parsed, &paragraph, parsed.elements[paragraph.template_element].first_child.?, .{}, 10000, false);
            defer allocator.free(xml);
            const merged = try @import("paragraph_joined_xml.zig").writeWithTabs(allocator, parsed, &draft, .{}, 10000);
            defer allocator.free(merged);
            var plan = try @import("paragraph_joined_tab_split_plan.zig").build(allocator, parsed, &draft, 3, 3);
            defer plan.deinit(allocator);
            var split = try @import("paragraph_joined_tab_split.zig").prepare(allocator, parsed, &draft, 3, 3, 10000);
            defer split.deinit(allocator);
            const view: Joined = .{ .pieces = draft.pieces, .sites = split.text.right };
            var parts = try @import("paragraph_joined_tab_partition.zig").build(allocator, parsed, &view, split.tabs.right);
            defer parts.deinit(allocator);
            var part = try view.paragraph(1);
            part.generated_id = 2;
            part.source_ordinal = null;
            part.protected_positions = parts.items[1];
            const output = try @import("paragraph_split_xml.zig").writeProtected(allocator, parsed, &part, .{}, 10000);
            defer allocator.free(output);
            const joined_output = try @import("paragraph_joined_xml.zig").writeOwnedTabs(allocator, parsed, &view, .{}, 10000, split.tabs.right);
            defer allocator.free(joined_output);
            var rows = [_]@import("paragraph_structure_values.zig").Paragraph{.{ .template_element = draft.pieces[0].template_element, .source_ordinal = draft.pieces[0].source_ordinal, .sites = draft.sites, .pieces = draft.pieces }};
            const model: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &rows };
            var materialized = try @import("paragraph_structure_joined_tab_split.zig").prepare(allocator, parsed, &model, 0, 3, 3, 2, 10000);
            defer materialized.deinit(allocator);
            for (materialized.paragraphs) |row| {
                const row_view = row.joined().?;
                const projected = try buildOwnedTabs(allocator, parsed, &row_view, row.protected_positions.?);
                defer allocator.free(projected);
            }
            _ = try @import("paragraph_structure_splice.zig").splice(allocator, parsed, &materialized, 1, 1, 0, "후속", 10000);
            var resplit = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, &materialized, 1, 1, 1, 3, 10000);
            defer resplit.deinit(allocator);
            var merged_again = try @import("paragraph_structure_merge.zig").prepare(allocator, parsed, &resplit, 1, 10000);
            defer merged_again.deinit(allocator);
            const merged_saved = try @import("paragraph_structure_save.zig").write(allocator, parsed, &merged_again, .{}, &.{}, 10000);
            defer allocator.free(merged_saved);
            const repeated_saved = try @import("paragraph_structure_save.zig").write(allocator, parsed, &resplit, .{}, &.{}, 10000);
            defer allocator.free(repeated_saved);
            const saved = try @import("paragraph_structure_save.zig").write(allocator, parsed, &materialized, .{}, &.{}, 10000);
            defer allocator.free(saved);
        }
    }.run, .{ &tree, &joined });
}
