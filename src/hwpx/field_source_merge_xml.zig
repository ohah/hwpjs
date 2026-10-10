//! 두 원본 필드 문단의 run을 왼쪽 shell에 조립합니다. 결과는 임시 XML입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Values, index: usize, right_index: usize, limit: usize) ![]u8 {
    var plan = try @import("field_source_merge_plan.zig").prepare(a, trees, section, current, index, right_index, 200_000);
    defer plan.deinit(a);
    const tree = &trees[section];
    return writeRows(a, tree, &.{ current.paragraphs[index], current.paragraphs[right_index] }, limit);
}

/// 여러 원본을 소유한 미게시 후보의 현재 값에서만 임시 XML을 만듭니다.
pub fn writeCandidate(a: std.mem.Allocator, trees: []const Tree, section: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, limit: usize) ![]u8 {
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const rows = try @import("field_source_candidate_rows.zig").build(a, trees, section, paragraph, &report, 200_000);
    defer a.free(rows);
    return writeRows(a, &trees[section], rows, limit);
}

pub fn writeCandidateDirty(a: std.mem.Allocator, trees: []const Tree, section: usize, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    const rendered = try writeCandidate(a, trees, section, paragraph, limit);
    defer a.free(rendered);
    return @import("field_candidate_dirty_xml.zig").write(a, &trees[section], paragraph.field_positions.?, rendered, fields, limit);
}

fn writeRows(a: std.mem.Allocator, tree: *const Tree, rows: []const @import("paragraph_structure_values.zig").Paragraph, limit: usize) ![]u8 {
    return writeRowsMode(a, tree, rows, null, &.{}, null, limit);
}

/// 그룹 검증기가 출처와 마커 귀속을 확인한 행의 문단 XML을 작성합니다.
pub fn writeOwnedRow(a: std.mem.Allocator, tree: *const Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize) ![]u8 {
    const joined = paragraph.joined() orelse return error.SourceBindingMismatch;
    try joined.validate();
    const rows = try a.alloc(@import("paragraph_structure_values.zig").Paragraph, joined.pieces.len);
    var initialized: usize = 0;
    defer {
        for (rows[0..initialized]) |row| if (row.character_styles) |styles| a.free(styles);
        a.free(rows);
    }
    for (rows, 0..) |*row, index| {
        row.* = try joined.paragraph(index);
        initialized += 1;
        row.character_styles = try @import("character_style_piece.zig").partition(a, &joined, index);
    }
    rows[0].paragraph_shape_id = paragraph.paragraph_shape_id;
    return writeRowsMode(a, tree, rows, paragraph.field_positions orelse return error.SourceBindingMismatch, fields, paragraph.generated_id, limit);
}

fn writeRowsMode(a: std.mem.Allocator, tree: *const Tree, rows: []const @import("paragraph_structure_values.zig").Paragraph, owned: ?[]const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, generated: ?u32, limit: usize) ![]u8 {
    const first = tree.elements[rows[0].template_element];
    if (first.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const ending = first.end_tag orelse return error.InvalidParagraphElement;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    if (generated) |id| {
        const opening = try @import("paragraph_continuation_tag.zig").write(a, tree, rows[0].template_element, id, limit);
        defer a.free(opening);
        try append(a, &output, opening, limit);
    } else try append(a, &output, tree.source[first.start_tag.start..first.start_tag.end], limit);
    for (rows, 0..) |*row, side| {
        try @import("paragraph_structure_policy.zig").validate(a, tree, row.template_element);
        if (row.character_styles) |styles| for (styles) |span| {
            if (span.run_element >= tree.elements.len or !tree.elements[span.run_element].is(uri, "run") or tree.elements[span.run_element].parent != row.template_element) return error.SourceBindingMismatch;
        };
        const owner = tree.elements[row.template_element];
        const closing = owner.end_tag orelse return error.InvalidParagraphElement;
        var cursor = owner.start_tag.end;
        var child = owner.first_child;
        while (child) |element_index| : (child = tree.elements[element_index].next_sibling) {
            const element = tree.elements[element_index];
            try append(a, &output, tree.source[cursor..element.start_tag.start], limit);
            cursor = element.end;
            if (element.is(uri, "linesegarray")) continue;
            if (!element.is(uri, "run")) return error.UnsupportedMergeMetadata;
            if (side == 1) {
                var content = element.first_child;
                while (content) |inner| : (content = tree.elements[inner].next_sibling) {
                    const value = tree.elements[inner];
                    if (value.is(uri, "secPr")) return error.UnsupportedMergeMetadata;
                    if (value.is(uri, "ctrl") and !@import("retained_field_marker.zig").supported(tree, inner)) return error.UnsupportedMergeMetadata;
                }
            }
            var run_styles: ?[]const @import("character_style_paint.zig").Span = null;
            if (row.character_styles) |styles| {
                var begin: ?usize = null;
                var finish: usize = 0;
                for (styles, 0..) |span, ordinal| if (span.run_element == element_index) {
                    if (begin == null) begin = ordinal;
                    finish = ordinal + 1;
                };
                if (begin) |first_span| run_styles = styles[first_span..finish];
            }
            var plain = row.*;
            plain.character_styles = null;
            const run = if (run_styles) |styles|
                try @import("character_style_run_closed.zig").writeFieldsCurrent(a, tree, &row.sites, styles, owned orelse return error.UnsupportedStructuralCharacterStyle, fields, generated != null, limit -| output.items.len)
            else if (owned) |markers|
                try @import("run_current_xml.zig").writeOwnedFields(a, tree, &plain, element_index, .{}, markers, fields, generated != null, limit -| output.items.len)
            else
                try @import("run_current_xml.zig").writeSourceFields(a, tree, row, element_index, .{}, limit -| output.items.len);
            defer a.free(run);
            try append(a, &output, run, limit);
        }
        try append(a, &output, tree.source[cursor..closing.start], limit);
    }
    try append(a, &output, tree.source[ending.start..ending.end], limit);
    if (rows[0].paragraph_shape_id) |id|
        return @import("paragraph_format_write.zig").writeCurrent(a, tree, rows[0].template_element, output.items, id, limit);
    return output.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}

test "field source merge XML retains current paragraph shape through allocation failures" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0'><!--left--><p:run><p:ctrl><p:fieldBegin id='77' type='HYPERLINK'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2' paraPrIDRef='0'><!--right--><p:run><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='77'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    current.paragraphs[0].paragraph_shape_id = 8;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, values: *const Values) !void {
            const result = try write(allocator, inputs, 0, values, 0, 1, 10000);
            defer allocator.free(result);
            try std.testing.expect(std.mem.indexOf(u8, result, "paraPrIDRef='8'") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "<!--left-->") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "<!--right-->") != null);
        }
    }.run, .{ &trees, &current });
    try std.testing.expectEqual(@as(?u32, 8), current.paragraphs[0].paragraph_shape_id);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "field source merge XML preserves actual source markers and unrelated paragraphs" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        const trees = [_]Tree{section.tree};
        var counters: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &counters);
        defer current.deinit(a);
        var successes: usize = 0;
        for (0..current.paragraphs.len - 1) |index| {
            const xml = write(a, &trees, 0, &current, index, index + 1, 4_000_000) catch |err| {
                if (err == error.UnsupportedMergeMetadata) continue;
                return err;
            };
            defer a.free(xml);
            var candidate = try @import("field_source_merge_values.zig").prepare(a, &trees, 0, &current, index, index + 1, 4_000_000);
            defer candidate.deinit(a);
            // 원본 마커 없는 일반 쌍은 기존 Joined 회귀가 소유합니다.
            // 두 작성기의 namespace closure 바이트는 같은 기준 결과가 아닙니다.
            if (candidate.paragraphs[index].field_positions.?.len == 0) continue;
            const whole = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &candidate, .{}, &.{}, 4_000_000);
            defer a.free(whole);
            const left = section.tree.elements[current.paragraphs[index].template_element];
            const right = section.tree.elements[current.paragraphs[index + 1].template_element];
            const saved = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{
                .{ .start = left.start_tag.start, .end = left.end, .text = "", .serialized_xml = xml },
                .{ .start = right.start_tag.start, .end = right.end, .text = "" },
            }, 4_000_000);
            defer a.free(saved);
            try std.testing.expectEqualStrings(saved, whole);
            var parsed = try @import("xml_part_tree.zig").parse(a, saved, .section, 0, 0, .{});
            defer parsed.deinit(a);
            var paragraph_count: usize = 0;
            for (parsed.elements) |element| if (element.is(uri, "p")) {
                paragraph_count += 1;
            };
            try std.testing.expectEqual(current.paragraphs.len - 1, paragraph_count);
            var saved_sites = try @import("text_sites.zig").collect(a, &parsed, .{});
            defer saved_sites.deinit(a);
            try std.testing.expectEqual(section.sites.items.len, saved_sites.items.len);
            for (section.sites.items, saved_sites.items) |one, two| try std.testing.expectEqualStrings(one.text, two.text);
            const after_trees = [_]Tree{parsed};
            var before = try @import("field_markers.zig").inspect(a, &trees, .{});
            defer before.deinit();
            var after = try @import("field_markers.zig").inspect(a, &after_trees, .{});
            defer after.deinit();
            try std.testing.expectEqual(before.markers.len, after.markers.len);
            for (before.markers, after.markers) |one, two| try std.testing.expectEqualStrings(section.tree.sourceOf(one.element_index), parsed.sourceOf(two.element_index));
            try std.testing.expectEqual(@as(usize, 0), after.unresolved_ends);
            for (current.paragraphs, 0..) |row, ordinal| {
                if (ordinal == index or ordinal == index + 1) continue;
                try std.testing.expect(std.mem.indexOf(u8, saved, section.tree.sourceOf(row.template_element)) != null);
            }
            const zip = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = saved }}, .{});
            defer a.free(zip);
            var probe = try @import("editor_session.zig").open(a, input, .{});
            defer probe.deinit();
            try std.testing.expect(try probe.mergeParagraph(0, index + probe.sections[0].first_paragraph));
            const session_zip = try probe.save();
            defer a.free(session_zip);
            const flow = try @import("paragraph_flow_snapshot.zig").read(a, &probe, 0);
            defer @import("paragraph_flow_snapshot.zig").free(a, flow);
            try std.testing.expectEqual(current.paragraphs.len - 1, flow.len);
            try std.testing.expectEqualSlices(u8, zip, session_zip);
            const labels = try probe.fieldLabels(0, index + probe.sections[0].first_paragraph);
            defer a.free(labels);
            if (labels.len != 0) {
                const target = labels[0];
                const paragraph = index + probe.sections[0].first_paragraph;
                try probe.sections[0].field_dirty.append(a, .{ .element_index = target.begin_element, .dirty = false });
                const clean_zip = try probe.save();
                defer a.free(clean_zip);
                var clean = try @import("editor_session.zig").open(a, clean_zip, .{});
                defer clean.deinit();
                const clean_labels = try clean.fieldLabels(0, paragraph);
                defer a.free(clean_labels);
                const clean_attribute = (try clean.sections[0].tree.attributeValue(a, clean_labels[0].begin_element, "", "dirty")).?;
                const clean_dirty = try clean_attribute.toUtf8(a, 100);
                defer a.free(clean_dirty);
                try std.testing.expectEqualStrings("0", clean_dirty);
                try @import("character_style_session.zig").validate(&probe, 0, paragraph, target.start, target.end, 0);
                const after_validation = try probe.save();
                defer a.free(after_validation);
                try std.testing.expectEqualSlices(u8, clean_zip, after_validation);
                if (std.mem.eql(u8, name, "hyperlink") and index == 0) {
                    try std.testing.expect(try probe.setCharacterFormat(0, paragraph, target.start, target.end, 0));
                    const styled_zip = try probe.save();
                    defer a.free(styled_zip);
                    var styled = try @import("editor_session.zig").open(a, styled_zip, .{});
                    defer styled.deinit();
                    const ranges = try @import("character_style_snapshot.zig").read(&styled, 0, paragraph);
                    defer a.free(ranges);
                    for (ranges) |range| if (range.start_unit < target.end and target.start < range.end_unit) try std.testing.expectEqual(@as(?u32, 0), range.char_shape_id);
                    // 뒤의 입력/분할 회귀는 서식 미편집 기준에서 계속 검사합니다.
                    if (probe.sections[0].structure_values.?.paragraphs[index].character_styles) |styles| a.free(styles);
                    probe.sections[0].structure_values.?.paragraphs[index].character_styles = null;
                }
                try std.testing.expect(try probe.spliceFieldLabel(0, paragraph, target.begin_element, target.start, 0, "후속😀<&"));
                const updated = try probe.fieldLabels(0, paragraph);
                defer a.free(updated);
                try std.testing.expectEqual(target.start, updated[0].start);
                try std.testing.expectEqual(target.end + 6, updated[0].end);
                const edited_zip = try probe.save();
                defer a.free(edited_zip);
                var edited = try @import("editor_session.zig").open(a, edited_zip, .{});
                defer edited.deinit();
                const fresh = try edited.fieldLabels(0, paragraph);
                defer a.free(fresh);
                try std.testing.expectEqual(updated[0].start, fresh[0].start);
                try std.testing.expectEqual(updated[0].end, fresh[0].end);
                const attribute = (try edited.sections[0].tree.attributeValue(a, fresh[0].begin_element, "", "dirty")).?;
                const dirty = try attribute.toUtf8(a, 100);
                defer a.free(dirty);
                try std.testing.expectEqualStrings("1", dirty);
                try std.testing.expect(std.mem.indexOf(u8, edited.sections[0].tree.source, "후속😀&lt;&amp;") != null);
            }
            try std.testing.expect(try probe.splitParagraph(0, index + probe.sections[0].first_paragraph, 0, 0));
            const split_zip = try probe.save();
            defer a.free(split_zip);
            var split_reopened = try @import("editor_session.zig").open(a, split_zip, .{});
            defer split_reopened.deinit();
            try std.testing.expectEqual(current.paragraphs.len, split_reopened.sections[0].last_paragraph - split_reopened.sections[0].first_paragraph + 1);
            const generated_paragraph = index + probe.sections[0].first_paragraph + 1;
            const generated_labels = try probe.fieldLabels(0, generated_paragraph);
            defer a.free(generated_labels);
            if (generated_labels.len != 0) {
                const target = generated_labels[0];
                try std.testing.expect(try probe.spliceFieldLabel(0, generated_paragraph, target.begin_element, target.start, 0, "생성😀<&"));
                const updated = try probe.fieldLabels(0, generated_paragraph);
                defer a.free(updated);
                try std.testing.expectEqual(target.end + 6, updated[0].end);
                const generated_zip = try probe.save();
                defer a.free(generated_zip);
                try std.testing.expectError(error.SplitSurrogatePair, probe.spliceFieldLabel(0, generated_paragraph, target.begin_element, target.start + 3, 0, "실패"));
                const after_refusal = try probe.save();
                defer a.free(after_refusal);
                try std.testing.expectEqualSlices(u8, generated_zip, after_refusal);
                var generated = try @import("editor_session.zig").open(a, generated_zip, .{});
                defer generated.deinit();
                const fresh = try generated.fieldLabels(0, generated_paragraph);
                defer a.free(fresh);
                try std.testing.expectEqual(updated[0].start, fresh[0].start);
                try std.testing.expectEqual(updated[0].end, fresh[0].end);
                try std.testing.expect(std.mem.indexOf(u8, generated.sections[0].tree.source, "생성😀&lt;&amp;") != null);
            }
            try std.testing.expect(try probe.mergeParagraph(0, index + probe.sections[0].first_paragraph));
            const rejoined_zip = try probe.save();
            defer a.free(rejoined_zip);
            var rejoined = try @import("editor_session.zig").open(a, rejoined_zip, .{});
            defer rejoined.deinit();
            try std.testing.expectEqual(current.paragraphs.len - 1, rejoined.sections[0].last_paragraph - rejoined.sections[0].first_paragraph + 1);
            if (generated_labels.len != 0) try std.testing.expect(std.mem.indexOf(u8, rejoined.sections[0].tree.source, "생성😀&lt;&amp;") != null);
            var reopened = try @import("editor_session.zig").open(a, zip, .{});
            defer reopened.deinit();
            try std.testing.expectEqual(current.paragraphs.len - 1, reopened.sections[0].last_paragraph - reopened.sections[0].first_paragraph + 1);
            try std.testing.expectEqualStrings(saved, reopened.sections[0].tree.source);
            const unchanged = try reopened.save();
            defer a.free(unchanged);
            try std.testing.expectEqualSlices(u8, zip, unchanged);
            var source_archive = try @import("../zip/archive.zig").open(a, input, .{});
            defer source_archive.deinit();
            var saved_archive = try @import("../zip/archive.zig").open(a, zip, .{});
            defer saved_archive.deinit();
            try std.testing.expectEqual(source_archive.entries.len, saved_archive.entries.len);
            for (source_archive.entries, saved_archive.entries, 0..) |original_entry, saved_entry, ordinal| {
                try std.testing.expectEqualStrings(original_entry.name, saved_entry.name);
                const original_bytes = try source_archive.decode(original_entry, 4_000_000);
                defer a.free(original_bytes);
                const saved_bytes = try saved_archive.decode(saved_entry, 4_000_000);
                defer a.free(saved_bytes);
                if (ordinal == section.entry_index) continue;
                try std.testing.expectEqualSlices(u8, original_bytes, saved_bytes);
            }
            successes += 1;
        }
        try std.testing.expect(successes > 0);
    }
}
