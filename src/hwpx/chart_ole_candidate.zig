//! Rebuild one chart OLE copy into owned bytes; never publishes a ZIP edit.
const std = @import("std");
const cfb = @import("../cfb/reader.zig");
const repairs = @import("../cfb/observed_repairs.zig");
const envelope = @import("../ole/envelope.zig");
pub const Options = struct {
    layout: envelope.Layout = .observed_size_prefix,
    allow_observed_deviations: bool = false,
    limits: cfb.Options = .{},
    max_output_bytes: usize = 256 * 1024 * 1024,
};
pub const Result = struct {
    bytes: []u8,
    changed: bool,
    original_error: ?anyerror,
    deviations: ?repairs.Deviations,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, zip_xml: []const u8, replacement: []const u8, options: Options) !Result {
    var original_error: ?anyerror = null;
    var deviations: ?repairs.Deviations = null;
    var file = @import("../ole/container.zig").open(a, input, options.layout, options.limits) catch |err| blk: {
        if (!options.allow_observed_deviations or (err != error.InvalidRoot and err != error.InvalidFat)) return err;
        original_error = err;
        const raw = try envelope.payload(input, options.layout, options.limits.max_input_bytes);
        const normalized = try repairs.open(a, raw, options.limits);
        deviations = normalized.deviations;
        break :blk normalized.file;
    };
    defer file.deinit();
    const target = try file.findExact("/OOXMLChartContents") orelse return error.StreamNotFound;
    if (file.entries[target].kind != 2) return error.NotAStream;
    const nested = file.entries[target].content;
    // Byte-aligned source pairs are supported first; mismatches are not repaired.
    if (!std.mem.eql(u8, nested, zip_xml)) return error.ChartRepresentationMismatch;
    var tree = try @import("chart_tree.zig").parse(a, replacement, 0, .{ .max_xml_bytes = options.max_output_bytes });
    defer tree.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    if (std.mem.eql(u8, nested, replacement)) {
        if (input.len > options.max_output_bytes) return error.LimitExceeded;
        return .{ .bytes = try a.dupe(u8, input), .changed = false, .original_error = original_error, .deviations = deviations };
    }
    const output = try @import("../ole/stream_replace.zig").rebuildOpened(a, &file, options.layout, &.{.{ .path = "/OOXMLChartContents", .content = replacement }}, .{ .limits = options.limits, .max_output_bytes = options.max_output_bytes });
    errdefer a.free(output);
    var reopened = try @import("../ole/container.zig").open(a, output, options.layout, options.limits);
    defer reopened.deinit();
    if (reopened.header.major != file.header.major) return error.ChartOleVersionMismatch;
    var before_count: usize = 0;
    var after_count: usize = 0;
    for (reopened.entries) |entry| after_count += @intFromBool(entry.kind != 0);
    for (file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        before_count += 1;
        const current_index = try reopened.findExact(try file.rootRelativePath(index)) orelse return error.ChartOleEntryMismatch;
        const current = reopened.entries[current_index];
        const expected = if (index == target) replacement else entry.content;
        if (current.kind != entry.kind or current.state != entry.state or current.created != entry.created or current.modified != entry.modified or !std.mem.eql(u8, &current.clsid, &entry.clsid)) return error.ChartOleMetadataMismatch;
        // Root content is the rebuilt aggregate mini-stream, not an independent stream.
        if (entry.kind == 2 and !std.mem.eql(u8, current.content, expected)) return error.ChartOleContentMismatch;
    }
    if (before_count != after_count) return error.ChartOleEntryCountMismatch;
    return .{ .bytes = output, .changed = true, .original_error = original_error, .deviations = deviations };
}
