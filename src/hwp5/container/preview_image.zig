const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const images = @import("images.zig");
pub const Policy = enum { preserve, reject };
pub const Options = struct {
    images: images.Options,
    empty: Policy,
    unhandled: Policy,
    max_bytes: usize = 64 * 1024 * 1024,
};
pub const State = enum { absent, empty, inspected, unhandled };
/// Scalars only. `inspected` means selected codec checks, not full rendering.
pub const Report = struct {
    state: State = .absent,
    stored_bytes: usize = 0,
    images: images.Report = .{},
};
/// Exact optional root stream; never apply the HWP compressed flag or inflate fallback.
/// Preserved empty/unhandled streams are consumed but explicitly not image-validated.
pub fn inspect(a: std.mem.Allocator, file: *const File, used: []bool, remaining: *usize, options: Options) !Report {
    const index = try file.findExact("/PrvImage") orelse return .{};
    const entry = file.entries[index];
    if (entry.kind != 2) return error.InvalidHwpEntryKind;
    const bytes = entry.content;
    if (bytes.len > options.max_bytes or bytes.len > remaining.*) return error.LimitExceeded;
    var report: Report = .{ .stored_bytes = bytes.len };
    if (bytes.len == 0) {
        if (options.empty == .reject) return error.EmptyPreviewImage;
        report.state = .empty;
    } else {
        var budget: images.Budget = .{ .options = options.images };
        try budget.consume(a, bytes, null);
        report.images = budget.report;
        report.state = if (budget.report.unhandled_binaries == 0) .inspected else .unhandled;
        if (report.state == .unhandled and options.unhandled == .reject) return error.UnsupportedPreviewImage;
    }
    remaining.* -= bytes.len;
    used[index] = true;
    return report;
}
