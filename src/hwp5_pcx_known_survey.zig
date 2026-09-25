const std = @import("std");
const container = @import("hwp5/container/validation.zig");

// Optional local corpus test. The reference clone is not a build dependency.
test "HWP PCX known paired document inspection" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/복학원서.hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    const document_options: @import("hwp5/document/types.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    var unselected = try container.inspect(a, bytes, .{ .document = document_options, .images = .{} });
    defer unselected.deinit(a);
    var report = try container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{ .pcx = .{} },
    });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.pcx.images);
    try std.testing.expectEqual(@as(usize, 110_110), report.images.?.pcx.decoded_bytes);
    try std.testing.expectEqual(@as(usize, 41_187), report.images.?.pcx.encoded_bytes);
    try std.testing.expectEqual(@as(usize, 0), report.images.?.pcx.extension_disagreements);
    try std.testing.expectEqual(@as(usize, 0), unselected.images.?.pcx.images);
    try std.testing.expectEqual(unselected.images.?.unhandled_binaries, report.images.?.unhandled_binaries + 1);
    try std.testing.expectEqual(unselected.binary_data.decoded, report.binary_data.decoded);
    try std.testing.expect(report.images.?.semantics_deferred);
    try std.testing.expectError(error.LimitExceeded, container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{ .pcx = .{}, .max_total_pcx_decoded_bytes = 110_109 },
    }));
}
