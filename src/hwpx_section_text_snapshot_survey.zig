const std = @import("std");
const package = @import("hwpx/package.zig");

const path = "reference/rhwp/samples/issue2527_empty_linesegs.hwpx";

fn read(a: std.mem.Allocator) !package.SectionTextSnapshot {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(1024 * 1024));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.readSectionTextSnapshot(a, .{});
}

test "HWPX section text snapshot known file owns normalized content" {
    var snapshot = try read(std.testing.allocator);
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(usize, 5), snapshot.report.text_elements);
    try std.testing.expectEqual(@as(usize, 607), snapshot.report.text_bytes);
    try std.testing.expect(snapshot.events.len > snapshot.report.text_elements * 2);
    var content_bytes: usize = 0;
    for (snapshot.events) |event| if (event.value == .content) {
        content_bytes += event.value.content.len;
    };
    try std.testing.expectEqual(snapshot.report.text_bytes, content_bytes);
}

// Binary stdout is consumed only by tools/hwpx-section-text-snapshot-diff.py.
test "HWPX section text snapshot raw content" {
    var snapshot = try read(std.testing.allocator);
    defer snapshot.deinit();
    for (snapshot.events) |event| if (event.value == .content) {
        try std.Io.File.stdout().writeStreamingAll(std.testing.io, event.value.content);
    };
}
