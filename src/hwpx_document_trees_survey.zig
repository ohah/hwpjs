const std = @import("std");
const package = @import("hwpx/package.zig");

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
    const expected_accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
    const expected_rejected = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
    const expected_encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
    const expected_sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
    const expected_header_elements = [_]usize{ 177104, 126736, 150513, 91454, 120759, 133881, 147705, 252470 };
    const expected_section_elements = [_]usize{ 299906, 229744, 218284, 124064, 356522, 297849, 252376, 395971 };
    const expected_header_bytes = [_]usize{ 11717857, 8327608, 9835741, 5823234, 7899943, 8527746, 9564672, 16078146 };
    const expected_section_bytes = [_]usize{ 23032794, 18221301, 16858881, 9304952, 27450891, 23164353, 19233517, 30724197 };
    try std.testing.expectEqual(expected_accepted[shard], accepted);
    try std.testing.expectEqual(expected_rejected[shard], rejected_zip);
    try std.testing.expectEqual(expected_encrypted[shard], encrypted);
    try std.testing.expectEqual(expected_sections[shard], sections);
    try std.testing.expectEqual(expected_header_elements[shard], header_elements);
    try std.testing.expectEqual(expected_section_elements[shard], section_elements);
    try std.testing.expectEqual(expected_header_bytes[shard], header_bytes);
    try std.testing.expectEqual(expected_section_bytes[shard], section_bytes);
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
