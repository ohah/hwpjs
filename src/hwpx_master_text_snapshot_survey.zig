const std = @import("std");
const package = @import("hwpx/package.zig");

const path = "reference/rhwp/samples/hwpx/exam-kor-1p.hwpx";

test "HWPX master text snapshot real file agrees with streaming report" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const streaming = try document.inspectMasterPageText(a, .{}, null);
    var result = try document.readMasterPageTextSnapshot(a, .{});
    defer result.deinit();
    try std.testing.expectEqual(streaming.parts, result.parts);
    try std.testing.expectEqual(streaming.sub_lists, result.sub_lists);
    try std.testing.expectEqual(streaming.xml_bytes, result.xml_bytes);
    try std.testing.expectEqualDeep(streaming.text, result.snapshot.report);
    try std.testing.expect(result.parts > 0);
    var text_bytes: usize = 0;
    var text_starts: usize = 0;
    var text_ends: usize = 0;
    for (result.snapshot.events) |event| {
        try std.testing.expectEqual(@as(@TypeOf(event.location.part_kind), .master_page), event.location.part_kind);
        try std.testing.expect(event.location.part_ordinal < result.parts);
        switch (event.value) {
            .content => |content| text_bytes += content.len,
            .text_start => text_starts += 1,
            .text_end => text_ends += 1,
            else => {},
        }
    }
    try std.testing.expectEqual(result.snapshot.report.text_bytes, text_bytes);
    try std.testing.expectEqual(result.snapshot.report.text_elements, text_starts);
    try std.testing.expectEqual(text_starts, text_ends);
    std.debug.print("master snapshot: parts={d} sublists={d} paragraphs={d} runs={d} text={d} bytes={d} events={d}\n", .{
        result.parts,                         result.sub_lists,                  result.snapshot.report.paragraphs, result.snapshot.report.runs,
        result.snapshot.report.text_elements, result.snapshot.report.text_bytes, result.snapshot.events.len,
    });
}
