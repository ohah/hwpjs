const std = @import("std");
const package = @import("hwpx/package.zig");
const expected = @import("hwpx_corpus_expectations.zig");

fn surveyShard(shard: usize) !void {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var header_elements: usize = 0;
    var section_elements: usize = 0;
    var header_bytes: usize = 0;
    var section_bytes: usize = 0;
    var paragraphs: usize = 0;
    var zero_ids: usize = 0;
    var missing_ids: usize = 0;
    var missing_para_tc_ids: usize = 0;
    var page_break_true: usize = 0;
    var page_break_absent: usize = 0;
    var column_break_true: usize = 0;
    var column_break_absent: usize = 0;
    var merged_absent: usize = 0;
    var merged_true: usize = 0;
    var begin_present: usize = 0;
    var begin_missing_attributes: usize = 0;
    var begin_nested: usize = 0;
    for (roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            var path_sum: usize = root_index;
            for (entry.path) |byte| path_sum += byte;
            if (path_sum % 8 != shard) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            var all = document.readXmlTrees(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX XML trees unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer all.deinit(a);
            var begin_report = try all.inspectBeginNumbers(a, .{});
            defer begin_report.deinit(a);
            if (begin_report.present) {
                begin_present += 1;
                begin_missing_attributes += begin_report.missingAttributes();
                inline for (@import("hwpx/header_begin_numbers.zig").fields, 0..) |_, field_index| {
                    try std.testing.expectEqualStrings("1", begin_report.values[field_index].?);
                }
            } else {
                try std.testing.expectEqualStrings("1.4", all.structure.header_version.?);
            }
            begin_nested += begin_report.nested_ignored;
            const paragraph_report = try all.inspectParagraphMetadata(a, .{});
            try std.testing.expectEqual(all.sections.len, paragraph_report.sections);
            paragraphs += paragraph_report.paragraphs;
            zero_ids += paragraph_report.zero_id;
            missing_ids += paragraph_report.missing_id;
            missing_para_tc_ids += paragraph_report.missing_para_tc_id;
            page_break_true += paragraph_report.page_break.true_value;
            page_break_absent += paragraph_report.page_break.absent;
            column_break_true += paragraph_report.column_break.true_value;
            column_break_absent += paragraph_report.column_break.absent;
            merged_absent += paragraph_report.merged.absent;
            merged_true += paragraph_report.merged.true_value;
            try std.testing.expectEqual(all.structure.header_item_index, all.header.item_index);
            try std.testing.expectEqual(all.structure.header_xml_bytes, all.header.source.len);
            try std.testing.expectEqual(all.structure.header_elements, all.header.elements.len);
            try std.testing.expectEqual(@as(?usize, null), all.header.section_ordinal);
            try std.testing.expectEqual(all.structure.sections.len, all.sections.len);
            try std.testing.expect(all.header.elements[0].is("http://www.hancom.co.kr/hwpml/2011/head", "head"));
            header_elements += all.header.elements.len;
            header_bytes += all.header.source.len;
            for (all.sections, 0..) |section, ordinal| {
                const selected = all.structure.sections[ordinal];
                try std.testing.expectEqual(@as(?usize, ordinal), section.section_ordinal);
                try std.testing.expectEqual(selected.item_index, section.item_index);
                try std.testing.expectEqual(selected.xml_bytes, section.source.len);
                try std.testing.expectEqual(selected.elements, section.elements.len);
                try std.testing.expect(section.elements[0].is("http://www.hancom.co.kr/hwpml/2011/section", "sec"));
                section_elements += section.elements.len;
                section_bytes += section.source.len;
                sections += 1;
            }
            accepted += 1;
        }
    }
    std.debug.print("HWPX XML trees shard={d} accepted={d} rejected_zip={d} encrypted={d} sections={d} header_elements={d} section_elements={d} header_bytes={d} section_bytes={d}\n", .{ shard, accepted, rejected_zip, encrypted, sections, header_elements, section_elements, header_bytes, section_bytes });
    const expected_header_elements = [_]usize{ 177104, 126736, 150513, 91454, 120759, 133881, 147705, 252470 };
    const expected_section_elements = [_]usize{ 299906, 229744, 218284, 124064, 356522, 297849, 252376, 395971 };
    const expected_header_bytes = [_]usize{ 11717857, 8327608, 9835741, 5823234, 7899943, 8527746, 9564672, 16078146 };
    const expected_section_bytes = [_]usize{ 23032794, 18221301, 16858881, 9304952, 27450891, 23164353, 19233517, 30724197 };
    const expected_zero_ids = [_]usize{ 5484, 3164, 1109, 2568, 28364, 8198, 630, 8376 };
    const expected_page_break_true = [_]usize{ 269, 110, 182, 138, 348, 147, 45, 297 };
    const expected_column_break_true = [_]usize{ 23, 34, 37, 0, 18, 36, 5, 78 };
    try std.testing.expectEqual(expected.accepted[shard], accepted);
    try std.testing.expectEqual(expected.rejected_zip[shard], rejected_zip);
    try std.testing.expectEqual(expected.encrypted[shard], encrypted);
    try std.testing.expectEqual(expected.sections[shard], sections);
    try std.testing.expectEqual(expected_header_elements[shard], header_elements);
    try std.testing.expectEqual(expected_section_elements[shard], section_elements);
    try std.testing.expectEqual(expected_header_bytes[shard], header_bytes);
    try std.testing.expectEqual(expected_section_bytes[shard], section_bytes);
    try std.testing.expectEqual(expected.paragraphs[shard], paragraphs);
    try std.testing.expectEqual(expected_zero_ids[shard], zero_ids);
    try std.testing.expectEqual(@as(usize, 0), missing_ids);
    try std.testing.expectEqual(paragraphs, missing_para_tc_ids);
    try std.testing.expectEqual(expected_page_break_true[shard], page_break_true);
    try std.testing.expectEqual(@as(usize, 0), page_break_absent);
    try std.testing.expectEqual(expected_column_break_true[shard], column_break_true);
    try std.testing.expectEqual(@as(usize, 0), column_break_absent);
    try std.testing.expectEqual(if (shard == 7) @as(usize, 987) else @as(usize, 0), merged_absent);
    try std.testing.expectEqual(@as(usize, 0), merged_true);
    try std.testing.expectEqual(expected.begin_present[shard], begin_present);
    try std.testing.expectEqual(@as(usize, 0), begin_missing_attributes);
    try std.testing.expectEqual(@as(usize, 0), begin_nested);
}

test "HWPX owned XML document trees shard 0" {
    try surveyShard(0);
}
test "HWPX owned XML document trees shard 1" {
    try surveyShard(1);
}
test "HWPX owned XML document trees shard 2" {
    try surveyShard(2);
}
test "HWPX owned XML document trees shard 3" {
    try surveyShard(3);
}
test "HWPX owned XML document trees shard 4" {
    try surveyShard(4);
}
test "HWPX owned XML document trees shard 5" {
    try surveyShard(5);
}
test "HWPX owned XML document trees shard 6" {
    try surveyShard(6);
}
test "HWPX owned XML document trees shard 7" {
    try surveyShard(7);
}
