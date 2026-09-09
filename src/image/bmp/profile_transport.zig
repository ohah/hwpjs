const std = @import("std");
const structure = @import("structure.zig");
const file_header = @import("file_header.zig");
pub const Kind = enum(u32) { linked = 0x4c494e4b, embedded = 0x4d424544 };
pub const Options = struct {
    structure: structure.Options = .{},
    max_profile_bytes: usize = 64 * 1024 * 1024,
    /// Includes the NUL terminator; not an operating-system path length rule.
    max_link_bytes: usize = 4096,
};
pub const View = struct {
    kind: Kind,
    file_offset: usize,
    declared_size: u32,
    /// Borrowed ICC bytes, or raw CP1252 path bytes excluding the first NUL.
    data: []const u8,
    stored_bytes: usize,
    before_profile: []const u8,
    after_profile: []const u8,
    semantics_deferred: bool = true,
};
pub fn inspect(bytes: []const u8, options: Options) !?View {
    return fromView(try structure.inspect(bytes, options.structure), options);
}
/// Requires structure.inspect's file View, not an in-memory/packed DIB.
/// Never opens a path, treats it as UTF-8, or borrows file-external trailing data.
pub fn fromView(view: structure.View, options: Options) !?View {
    if (view.header.kind != .v5) return null;
    const kind = std.enums.fromInt(Kind, view.header.colour.?.space) orelse return null;
    const profile = view.header.profile.?;
    const start: u64 = @as(u64, file_header.byte_size) + profile.offset;
    const pixel_end: u64 = @as(u64, view.file.pixels_offset) + view.pixels.len;
    if (start < pixel_end or start > view.file.size) return error.InvalidBmpProfileOffset;
    const relative: usize = @intCast(start - pixel_end);
    const available = view.after_pixels[relative..];
    const length: usize = switch (kind) {
        .embedded => blk: {
            if (profile.size > options.max_profile_bytes) return error.LimitExceeded;
            if (profile.size > available.len) return error.UnexpectedEnd;
            break :blk profile.size;
        },
        .linked => blk: {
            const scan = available[0..@min(available.len, options.max_link_bytes)];
            const end = std.mem.indexOfScalar(u8, scan, 0) orelse {
                if (available.len > scan.len) return error.LimitExceeded;
                return error.UnterminatedBmpProfileLink;
            };
            break :blk end + 1;
        },
    };
    return .{
        .kind = kind,
        .file_offset = @intCast(start),
        .declared_size = profile.size,
        .data = available[0..if (kind == .linked) length - 1 else length],
        .stored_bytes = length,
        .before_profile = view.after_pixels[0..relative],
        .after_profile = available[length..],
    };
}
