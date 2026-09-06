const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Header = @import("../file_header.zig").Header;
pub const Report = struct {
    version: ?struct { high: u32, low: u32 } = null,
    source_units: ?[4]usize = null,
    decoded_bytes: usize = 0,
    trailing_bytes: usize = 0,
};
/// Exact optional children only. Presence does not imply script execution support.
/// Scalar report only; raw fields are available through the borrowed payload parsers.
pub fn inspect(a: std.mem.Allocator, file: *const File, header: *const Header, used: []bool, remaining: *usize) !Report {
    var result: Report = .{};
    const storage = try file.findExact("/Scripts") orelse return result;
    if (file.entries[storage].kind != 1) return error.InvalidHwpEntryKind;
    inline for (.{ "/Scripts/JScriptVersion", "/Scripts/DefaultJScript" }, 0..) |path, kind| {
        if (try file.findExact(path)) |index| {
            const entry = file.entries[index];
            if (entry.kind != 2) return error.InvalidHwpEntryKind;
            const bytes = try @import("../stream.zig").decode(a, header, entry.content, remaining.*);
            defer a.free(bytes);
            if (kind == 0) {
                const version = try @import("../scripts/version.zig").Version.parse(bytes);
                result.trailing_bytes += version.extra.len;
                result.version = .{ .high = version.high, .low = version.low };
            } else {
                const source = try @import("../scripts/source.zig").Source.parse(bytes);
                result.source_units = .{ source.header.len / 2, source.source.len / 2, source.pre.len / 2, source.post.len / 2 };
                result.trailing_bytes += source.extra.len;
            }
            result.decoded_bytes += bytes.len;
            remaining.* -= bytes.len;
            used[index] = true;
        }
    }
    return result;
}
