//! Compose an already resolved chart/OLE pair into one new HWPX ZIP candidate.
//! Pair selection and Session publication are separate responsibilities.
const std = @import("std");
const zip = @import("../zip/archive.zig");
const ole = @import("chart_ole_candidate.zig");
pub const Options = struct { max_input_bytes: usize = 64 * 1024 * 1024, max_output_bytes: usize = 128 * 1024 * 1024, max_entry_bytes: usize = 32 * 1024 * 1024, ole: ole.Options = .{} };
pub const Result = struct {
    bytes: []u8,
    changed: bool,
    original_ole_error: ?anyerror,
    deviations: ?@import("../cfb/observed_repairs.zig").Deviations,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, chart_path: []const u8, ole_path: []const u8, edits: []const @import("chart_numeric_point_write.zig").Edit, options: Options) !Result {
    if (input.len > options.max_input_bytes) return error.LimitExceeded;
    if (!zip.validPath(chart_path) or !zip.validPath(ole_path) or std.mem.eql(u8, chart_path, ole_path)) return error.InvalidChartPair;
    var document = try @import("package.zig").inspectDocument(a, input, .{ .zip = .{ .max_entry_bytes = options.max_entry_bytes } });
    defer document.deinit(a);
    var protection = try document.inspectProtection(a, .{});
    defer protection.deinit(a);
    if (protection.encrypted_paths.len != 0) return error.EncryptedDocument;
    var chart_index: ?usize = null;
    var ole_index: ?usize = null;
    for (document.archive.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, chart_path)) chart_index = index;
        if (std.mem.eql(u8, entry.name, ole_path)) ole_index = index;
    }
    const chart_id = chart_index orelse return error.MissingChartEntry;
    const ole_id = ole_index orelse return error.MissingOleEntry;
    const xml = try document.archive.decode(document.archive.entries[chart_id], options.max_entry_bytes);
    defer a.free(xml);
    const payload = try document.archive.decode(document.archive.entries[ole_id], options.max_entry_bytes);
    defer a.free(payload);
    var tree = try @import("chart_tree.zig").parse(a, xml, chart_id, .{ .max_xml_bytes = options.max_entry_bytes });
    defer tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer values.deinit(a);
    const new_xml = try @import("chart_numeric_point_write.zig").write(a, &tree, &values, edits, options.max_entry_bytes);
    defer a.free(new_xml);
    var ole_options = options.ole;
    ole_options.max_output_bytes = @min(ole_options.max_output_bytes, options.max_entry_bytes);
    var new_ole = try ole.prepare(a, payload, xml, new_xml, ole_options);
    defer new_ole.deinit(a);
    const output = try @import("../zip/replace_writer.zig").write(a, input, &.{ .{ .entry_index = chart_id, .bytes = new_xml }, .{ .entry_index = ole_id, .bytes = new_ole.bytes } }, .{ .read = .{ .max_entry_bytes = options.max_entry_bytes }, .max_output_bytes = options.max_output_bytes });
    errdefer a.free(output);
    var checked = try zip.open(a, output, .{ .max_entry_bytes = options.max_entry_bytes });
    defer checked.deinit();
    if (checked.entries.len != document.archive.entries.len) return error.ChartZipCandidateMismatch;
    for (document.archive.entries, checked.entries, 0..) |before, after, index| {
        if (!std.mem.eql(u8, before.name, after.name)) return error.ChartZipCandidateMismatch;
        const actual = try checked.decode(after, options.max_entry_bytes);
        defer a.free(actual);
        const original = try document.archive.decode(before, options.max_entry_bytes);
        defer a.free(original);
        const expected = if (index == chart_id) new_xml else if (index == ole_id) new_ole.bytes else original;
        if (!std.mem.eql(u8, actual, expected)) return error.ChartZipCandidateMismatch;
    }
    return .{ .bytes = output, .changed = new_ole.changed, .original_ole_error = new_ole.original_error, .deviations = new_ole.deviations };
}
