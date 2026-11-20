//! Read the official root OOXMLChartContents representation only.
//! Contents and presentation caches are reported, never treated as current or rewritten.
const std = @import("std");
const chart = @import("../../hwpx/chart_tree.zig");
pub const Snapshot = struct {
    tree: chart.Tree,
    stream_entry: usize,
    resource_sha256: [32]u8,
    legacy_backup_present: bool,
    presentation_streams: usize,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        self.tree.deinit(a);
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, decoded: []const u8, layout: @import("../../ole/envelope.zig").Layout) !Snapshot {
    var container = try @import("../../ole/container.zig").open(a, decoded, layout, .{
        .strict = true,
        .max_input_bytes = 32 * 1024 * 1024,
        .max_stream_bytes = 16 * 1024 * 1024,
        .max_total_stream_bytes = 32 * 1024 * 1024,
    });
    defer container.deinit();
    const index = try container.findExact("/OOXMLChartContents") orelse return error.ChartOOXMLUnavailable;
    if (container.entries[index].kind != 2) return error.InvalidChartOOXMLStream;
    const backup = try container.findExact("/Contents");
    if (backup) |entry| if (container.entries[entry].kind != 2) return error.InvalidChartBackupStream;
    var presentations: usize = 0;
    for (container.entries) |entry| {
        if (entry.kind != 2 or entry.parent != 0) continue;
        // Use the CFB entry ownership, not its root-prefixed display path.
        // Presentation bytes remain uninterpreted and unchanged.
        if (std.mem.startsWith(u8, entry.name, "\x02OlePres")) presentations += 1;
    }
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(decoded, &digest, .{});
    return .{
        .tree = try chart.parse(a, container.entries[index].content, index, .{}),
        .stream_entry = index,
        .resource_sha256 = digest,
        .legacy_backup_present = backup != null,
        .presentation_streams = presentations,
    };
}
