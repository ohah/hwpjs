//! Bounded request envelope and JSON view; border meaning stays in HWPX readers.
const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
const Batch = @import("../hwpx/table_border_sources_batch.zig");
pub const max_sections = 1024;
pub const max_bytes = 4 + max_sections * 4;

pub fn decode(a: std.mem.Allocator, bytes: []const u8) ![]usize {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    var reader: Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    if (count > max_sections) return error.LimitExceeded;
    if (count > (bytes.len - reader.offset) / 4) return error.UnexpectedEnd;
    const sections = try a.alloc(usize, count);
    errdefer a.free(sections);
    for (sections) |*section| section.* = try reader.readInt(u32);
    if (reader.offset != bytes.len) return error.InvalidTableBorderBatch;
    return sections;
}

pub const Json = struct {
    report: *const Batch.Report,
    pub fn jsonStringify(self: Json, writer: anytype) !void {
        try writer.beginArray();
        for (self.report.entries) |entry| {
            try writer.beginObject();
            try writer.objectField("section");
            try writer.write(entry.section);
            switch (entry.result) {
                .value => |value| {
                    try writer.objectField("value");
                    try writer.write(.{ .sourceOnly = true, .cells = value.cells, .styles = value.styles });
                },
                .unavailable => |err| {
                    try writer.objectField("error");
                    try writer.write(@errorName(err));
                },
            }
            try writer.endObject();
        }
        try writer.endArray();
    }
};

test "table border batch wire preserves duplicates and refuses truncation and trailing input" {
    const a = std.testing.allocator;
    const sections = try decode(a, &.{ 3, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 255, 255, 255, 255 });
    defer a.free(sections);
    try std.testing.expectEqualSlices(usize, &.{ 2, 2, 0xffffffff }, sections);
    for ([_][]const u8{ &.{}, &.{0}, &.{ 1, 0, 0, 0 } }) |bad| try std.testing.expectError(error.UnexpectedEnd, decode(a, bad));
    try std.testing.expectError(error.InvalidTableBorderBatch, decode(a, &.{ 0, 0, 0, 0, 0 }));
    try std.testing.expectError(error.LimitExceeded, decode(a, &.{ 1, 4, 0, 0 }));
}

test "table border batch wire JSON keeps per-section failures separate from empty values" {
    var entries = [_]Batch.Entry{
        .{ .section = 7, .result = .{ .unavailable = error.InvalidSectionIndex } },
        .{ .section = 0, .result = .{ .value = .{ .cells = &.{}, .styles = &.{} } } },
    };
    const report: Batch.Report = .{ .entries = &entries };
    const bytes = try std.json.Stringify.valueAlloc(std.testing.allocator, Json{ .report = &report }, .{});
    defer std.testing.allocator.free(bytes);
    try std.testing.expectEqualStrings("[{\"section\":7,\"error\":\"InvalidSectionIndex\"},{\"section\":0,\"value\":{\"sourceOnly\":true,\"cells\":[],\"styles\":[]}}]", bytes);
}
