const std = @import("std");
const zip = @import("../zip/archive.zig");

pub const Archive = zip.Archive;
pub const Options = zip.Options;
pub const mime = "application/hwp+zip";

/// Owns only the entry index. The input archive bytes must outlive this view.
pub fn open(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Archive {
    var archive = try zip.open(allocator, bytes, options);
    errdefer archive.deinit();
    const mime_entry = archive.find("mimetype") orelse return error.MissingMimeType;
    if (mime_entry.method != 0) return error.InvalidMimeType;
    const content = try archive.decode(mime_entry, mime.len);
    defer allocator.free(content);
    if (!std.mem.eql(u8, content, mime)) return error.InvalidMimeType;
    return archive;
}
