const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Section = @import("../document/types.zig").Section;
const paths = @import("paths.zig");
/// Owns array and decoded bytes; marks only direct BodyText section streams.
pub fn decode(a: std.mem.Allocator, file: *const File, header: *const @import("../file_header.zig").Header, used: []bool, remaining: *usize, max_sections: usize) ![]Section {
    const body = try paths.required(file, "/BodyText", 1);
    var result: std.ArrayList(Section) = .empty;
    errdefer {
        for (result.items) |s| a.free(s.bytes);
        result.deinit(a);
    }
    for (file.entries, 0..) |entry, i| {
        if (entry.kind == 0 or entry.parent != body) continue;
        const index = try paths.sectionIndex(entry.name) orelse continue;
        if (entry.kind != 2) return error.InvalidHwpEntryKind;
        if (result.items.len >= max_sections) return error.LimitExceeded;
        const bytes = try @import("../stream.zig").decode(a, header, entry.content, remaining.*);
        errdefer a.free(bytes);
        try result.append(a, .{ .index = index, .bytes = bytes });
        remaining.* -= bytes.len;
        used[i] = true;
    }
    return result.toOwnedSlice(a);
}
pub fn deinit(a: std.mem.Allocator, sections: []const Section) void {
    for (sections) |s| a.free(s.bytes);
    a.free(sections);
}
