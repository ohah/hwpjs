const std = @import("std");
const ole = @import("../ole/container.zig");
pub const Options = struct {
    layout: ole.envelope.Layout,
    cfb: @import("../../cfb/types.zig").Options = .{},
    max_containers: usize = 100000,
    max_total_envelope_bytes: usize = 64 * 1024 * 1024,
    max_total_stream_bytes: usize = 256 * 1024 * 1024,
    max_total_entries: usize = 1000000,
    max_total_path_bytes: usize = 64 * 1024 * 1024,
};
/// Structure-only diagnostics. All counts are per DocInfo consumption, including
/// repeated references to the same stream. No stream semantics are inferred.
pub const Report = struct {
    binaries: usize = 0,
    unhandled_binaries: usize = 0,
    containers: usize = 0,
    envelope_bytes: usize = 0,
    streams: usize = 0,
    stream_bytes: usize = 0,
    entries: usize = 0,
    path_bytes: usize = 0,
};
pub const Budget = struct {
    options: Options,
    report: Report = .{},

    /// Selection uses DocInfo STORAGE or the exact ASCII OLE extension hint,
    /// never a magic-byte guess. Failure leaves this scalar report unchanged.
    pub fn consume(self: *Budget, a: std.mem.Allocator, bytes: []const u8, storage: bool, extension: ?[]const u8) !void {
        var next = self.report;
        next.binaries = try add(next.binaries, 1);
        if (!storage and !@import("extension.zig").is(extension orelse &.{}, "ole")) {
            next.unhandled_binaries = try add(next.unhandled_binaries, 1);
            self.report = next;
            return;
        }
        if (next.containers >= self.options.max_containers) return error.LimitExceeded;
        var limits = self.options.cfb;
        limits.max_input_bytes = @min(limits.max_input_bytes, try remaining(self.options.max_total_envelope_bytes, next.envelope_bytes));
        limits.max_total_stream_bytes = @min(limits.max_total_stream_bytes, try remaining(self.options.max_total_stream_bytes, next.stream_bytes));
        limits.max_entries = @min(limits.max_entries, try remaining(self.options.max_total_entries, next.entries));
        limits.max_path_bytes = @min(limits.max_path_bytes, try remaining(self.options.max_total_path_bytes, next.path_bytes));
        var file = try ole.open(a, bytes, self.options.layout, limits);
        defer file.deinit();
        next.containers = try add(next.containers, 1);
        next.envelope_bytes = try add(next.envelope_bytes, bytes.len);
        next.entries = try add(next.entries, file.entries.len);
        for (file.entries) |entry| {
            next.path_bytes = try add(next.path_bytes, entry.path.len);
            if (entry.kind == 2) {
                next.streams = try add(next.streams, 1);
                next.stream_bytes = try add(next.stream_bytes, entry.content.len);
            }
        }
        self.report = next;
    }
};
fn remaining(limit: usize, used: usize) !usize {
    if (used > limit) return error.LimitExceeded;
    return limit - used;
}
fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}
