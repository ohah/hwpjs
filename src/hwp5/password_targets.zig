//! Encryption target selection from container ownership and DocInfo metadata.
const std = @import("std");
const File = @import("../cfb/reader.zig").File;
const paths = @import("container/paths.zig");
pub const Target = struct { entry_index: usize, compressed: bool };

/// Caller owns target array. No suffix-sniffing or basename aliases.
pub fn read(a: std.mem.Allocator, file: *const File, header: @import("file_header.zig").Header, normalized_docinfo: []const u8) ![]Target {
    var targets: std.ArrayList(Target) = .empty;
    errdefer targets.deinit(a);
    const used = try a.alloc(bool, file.entries.len);
    defer a.free(used);
    @memset(used, false);
    try append(a, &targets, used, try paths.required(file, "/DocInfo", 2), header.has(.compressed));
    const body = try paths.required(file, "/BodyText", 1);
    const scripts = try file.findExact("/Scripts");
    if (scripts) |index| if (file.entries[index].kind != 1) return error.InvalidHwpEntryKind;
    for (file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        if (entry.parent == body) {
            _ = try paths.sectionIndex(entry.name) orelse return error.UnexpectedBodyStream;
            try append(a, &targets, used, index, header.has(.compressed));
        } else if (scripts != null and entry.parent == scripts.?) {
            try append(a, &targets, used, index, header.has(.compressed));
        }
    }
    var records = @import("record.zig").Iterator.init(normalized_docinfo, .{});
    while (try records.next()) |record| {
        if (record.tag != 18) continue;
        if (record.level != 1) return error.InvalidDocInfoLevel;
        const item = try @import("docinfo/bin_data.zig").BinData.parse(record.payload);
        if (item.data == .link) continue;
        const target = try item.target(.observed_optional_extension) orelse return error.UnsupportedBinDataType;
        const path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
        defer a.free(path);
        try append(a, &targets, used, try paths.required(file, path, 2), try item.isCompressed(header.has(.compressed)));
    }
    // Never remove document protection while leaving unclassified encrypted
    // descendants in either protected storage.
    const binaries = try file.findExact("/BinData");
    if (binaries) |index| if (file.entries[index].kind != 1) return error.InvalidHwpEntryKind;
    for (file.entries, 0..) |entry, index| {
        if (entry.kind == 0 or entry.kind == 5) continue;
        if (entry.parent == body or (scripts != null and entry.parent == scripts.?) or (binaries != null and entry.parent == binaries.?)) {
            if (entry.kind != 2 or !used[index]) return error.UnclassifiedPasswordStream;
        }
    }
    return targets.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, targets: *std.ArrayList(Target), used: []bool, index: usize, compressed: bool) !void {
    if (used[index]) return error.DuplicatePasswordTarget;
    try targets.append(a, .{ .entry_index = index, .compressed = compressed });
    used[index] = true;
}
