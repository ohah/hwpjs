const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const summary = @import("../summary/parser.zig");
pub fn inspect(a: std.mem.Allocator, file: *const File, used: []bool, remaining: *usize, max_properties: usize) !?summary.Stats {
    const index = try file.findExact("/\x05HwpSummaryInformation") orelse return null;
    const entry = file.entries[index];
    if (entry.kind != 2) return error.InvalidHwpEntryKind;
    if (entry.content.len > remaining.*) return error.LimitExceeded;
    var doc = try summary.Document.parse(a, entry.content, max_properties);
    defer doc.deinit(a);
    remaining.* -= entry.content.len;
    used[index] = true;
    return doc.stats;
}
