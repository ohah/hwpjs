//! Shared bounded DTO encoder. No model/owner issuance or document state here.
//! Count under the hard bound without allocations, then allocate exact output.
const std = @import("std");
const m = @import("../model/text_transaction.zig");
const Binding = @import("../model/formatting_patch.zig").Binding;
pub const reply_bytes: usize = 2 * 1024 * 1024;
pub const Format = enum { hwp5, hwpx };
const Counter = struct {
    count: usize = 0,
    writer: std.Io.Writer = .{ .vtable = &.{ .drain = drain }, .buffer = &.{} },
    fn drain(w: *std.Io.Writer, data: []const []const u8, splat: usize) std.Io.Writer.Error!usize {
        const self: *Counter = @alignCast(@fieldParentPtr("writer", w));
        var n = std.math.mul(usize, data[data.len - 1].len, splat) catch return error.WriteFailed;
        for (data[0 .. data.len - 1]) |part| n = std.math.add(usize, n, part.len) catch return error.WriteFailed;
        if (n > reply_bytes - self.count) return error.WriteFailed;
        self.count += n;
        return n;
    }
};
fn encode(a: std.mem.Allocator, value: anytype) ![]u8 {
    var counter: Counter = .{};
    std.json.Stringify.value(value, .{}, &counter.writer) catch return error.LimitExceeded;
    const bytes = try a.alloc(u8, counter.count);
    errdefer a.free(bytes);
    var writer = std.Io.Writer.fixed(bytes);
    std.json.Stringify.value(value, .{}, &writer) catch return error.LimitExceeded;
    if (writer.buffered().len != bytes.len) return error.InvalidTextTransactionReply;
    return bytes;
}
pub fn capabilities(a: std.mem.Allocator, format: Format, binding: Binding, supports_rich_insertion: bool) ![]u8 {
    return encode(a, .{
        .schemaVersion = @as(u32, 1),
        .atomic = true,
        .format = @tagName(format),
        .coordinateSpace = "native-source-utf16",
        .requiresHistoryProtocol = @as(u32, 2),
        .binding = binding,
        .limits = .{
            .requestBytes = m.limits.request_bytes,
            .requestDepth = m.limits.request_depth,
            .requestStructure = m.limits.request_structure,
            .replyBytes = reply_bytes,
            .groups = m.limits.groups,
            .edits = m.limits.edits_count,
            .textUnits = m.limits.text_units,
            .insertedBytes = m.limits.inserted_bytes,
            .sections = m.limits.sections,
            .snapshotParagraphs = m.limits.snapshot_paragraphs,
        },
        .supportsRichInsertion = supports_rich_insertion,
        .supportsNewlines = false,
        .ordinaryOnly = true,
    });
}
/// Rows need only owner.{section,paragraph}, ref and before_units. Extra H5/Hx
/// typed fields are never serialized; refs/coverage have already been authorized.
pub fn query(a: std.mem.Allocator, binding: Binding, coverage: m.Coverage, rows: anytype) ![]u8 {
    const Query = struct {
        binding: Binding,
        coverage: m.Coverage,
        rows: @TypeOf(rows),
        pub fn jsonStringify(self: @This(), j: *std.json.Stringify) !void {
            try j.beginObject();
            try j.objectField("schemaVersion");
            try j.write(@as(u32, 1));
            try j.objectField("binding");
            try j.write(self.binding);
            try j.objectField("coverage");
            try j.beginObject();
            try j.objectField("sections");
            try j.beginArray();
            for (self.coverage.sections) |section| try j.write(.{ .section = section.section, .paragraphCount = section.paragraphs });
            try j.endArray();
            try j.objectField("totalParagraphs");
            try j.write(self.coverage.paragraphs);
            try j.objectField("createdCellParagraphs");
            try j.write(self.coverage.created_cell_paragraphs);
            try j.endObject();
            try j.objectField("targets");
            try j.beginArray();
            for (self.rows) |row| try j.write(.{ .ref = row.ref, .section = row.owner.section, .paragraph = row.owner.paragraph, .beforeUnits = row.before_units });
            try j.endArray();
            try j.endObject();
        }
    };
    return encode(a, Query{ .binding = binding, .coverage = coverage, .rows = rows });
}
