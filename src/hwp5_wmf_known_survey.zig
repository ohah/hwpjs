const std = @import("std");
const container = @import("hwp5/container/validation.zig");

const document_options: @import("hwp5/document/types.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };

// Optional local corpus test; reference files are not a build dependency.
test "HWP WMF known standard BinData inspection" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/156636617_240617 2024년 5월 월간 수출입 현황(확정치).hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var unselected = try container.inspect(a, bytes, .{ .document = document_options, .images = .{} });
    defer unselected.deinit(a);
    var report = try container.inspect(a, bytes, .{ .document = document_options, .images = .{ .wmf = .{} } });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.images.?.wmf.images);
    try std.testing.expectEqual(@as(usize, 127_658), report.images.?.wmf.bytes);
    try std.testing.expectEqual(@as(usize, 1_527), report.images.?.wmf.records);
    try std.testing.expectEqual(@as(usize, 0), report.images.?.wmf.placeable_images);
    try std.testing.expectEqual(@as(usize, 0), report.images.?.wmf.extension_disagreements);
    try std.testing.expectEqual(unselected.images.?.unhandled_binaries, report.images.?.unhandled_binaries + report.images.?.wmf.images);
    try std.testing.expectEqual(unselected.binary_data.decoded, report.binary_data.decoded);
    try std.testing.expect(report.images.?.semantics_deferred);
    try std.testing.expectError(error.LimitExceeded, container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{ .wmf = .{}, .max_total_wmf_bytes = 127_657 },
    }));
}

test "HWP WMF known nonzero tail is not accepted as a complete metafile" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwp", a, .limited(16 * 1024 * 1024));
    defer a.free(bytes);
    var unselected = try container.inspect(a, bytes, .{ .document = document_options, .images = .{} });
    defer unselected.deinit(a);
    try std.testing.expect(unselected.images.?.unhandled_binaries > 0);
    try std.testing.expectError(error.InvalidWmfSize, container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{ .wmf = .{} },
    }));
}

test "HWP WMF known placeable BinData uses specified whole-metafile size" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6060/30307_local_service_reform.hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    var file = try @import("cfb/reader.zig").File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const header_index = try @import("hwp5/container/paths.zig").required(&file, "/FileHeader", 2);
    const h = try @import("hwp5/file_header.zig").Header.parse(file.entries[header_index].content);
    try std.testing.expect(h.has(.compressed));
    const index = try @import("hwp5/container/paths.zig").required(&file, "/BinData/BIN0003.WMF", 2);
    const decoded = try @import("hwp5/compressed_stream.zig").decode(a, file.entries[index].content, 64 * 1024 * 1024);
    defer a.free(decoded);
    const report = try @import("hwp5/container/wmf_images.zig").inspect(decoded, .{}, 900);
    try std.testing.expectEqual(@as(usize, 1), report.images);
    try std.testing.expectEqual(@as(usize, 1), report.placeable_images);
    try std.testing.expectEqual(@as(usize, 900), report.bytes);
    try std.testing.expectEqual(@as(usize, 77), report.records);
}
