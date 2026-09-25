const std = @import("std");
const container = @import("hwp5/container/validation.zig");

const document_options: @import("hwp5/document/types.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };

// Optional local corpus test; reference files are not a build dependency.
test "HWP PNG known zero tail retains nonconformance while connecting WMF" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6060/30307_local_service_reform.hwp", a, .limited(2 * 1024 * 1024));
    defer a.free(bytes);
    try std.testing.expectError(error.TrailingData, container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{ .wmf = .{} },
    }));
    var report = try container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{
            .png = .{ .structure = .{ .post_iend = .{ .zero_padding = 1740 } } },
            .max_total_png_post_iend_zero_bytes = 1740,
            .wmf = .{},
        },
    });
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.png_post_iend_zero_images);
    try std.testing.expectEqual(@as(usize, 1740), report.images.?.png_post_iend_zero_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.images.?.wmf.placeable_images);
    try std.testing.expectEqual(@as(usize, 77), report.images.?.wmf.records);
    try std.testing.expect(report.images.?.semantics_deferred);
    try std.testing.expectError(error.LimitExceeded, container.inspect(a, bytes, .{
        .document = document_options,
        .images = .{
            .png = .{ .structure = .{ .post_iend = .{ .zero_padding = 1739 } } },
            .max_total_png_post_iend_zero_bytes = 1740,
            .wmf = .{},
        },
    }));
}
