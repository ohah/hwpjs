const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const prefixes = @import("series_prefix.zig");
const sections = @import("series_label_section.zig");
const suffixes = @import("series_suffix.zig");
const pictures = @import("series_picture.zig");
pub const Options = struct { section: sections.Options = .{}, max_code_bytes: usize = 65535 };
pub const Series = struct {
    prefix: prefixes.Prefix,
    section: sections.Section,
    suffix: suffixes.Suffix,
    picture: pictures.Block,
    trailer: [106]u8,
    end: usize,
    pub fn deinit(self: *Series) void {
        self.section.deinit();
        self.* = undefined;
    }
};

/// Selected observed v2 layout with explicit caller-supplied Point count.
/// Array words stay raw. The 106-byte trailer has no assigned field semantics.
/// Owns the Point slice, copies raw fields, borrows Strings. On any failure
/// preserves reader and frees owned storage; caller must discard both tables.
pub fn readObservedV2(a: std.mem.Allocator, reader: *Reader, types: *Types, objects: *Objects, point_count: usize, options: Options) !Series {
    if (point_count > options.section.max_points) return error.LimitExceeded;
    var next = reader.*;
    const prefix = try prefixes.readObservedV2(&next, types, objects);
    var section = try sections.readObserved(a, &next, types, objects, point_count, options.section);
    errdefer section.deinit();
    const suffix = try suffixes.readObserved(&next, types, objects, .{ .text = options.section.text, .max_code_bytes = options.max_code_bytes });
    const picture = try pictures.readObserved(&next, types, objects);
    const trailer = (try next.take(106))[0..106].*;
    reader.* = next;
    return .{ .prefix = prefix, .section = section, .suffix = suffix, .picture = picture, .trailer = trailer, .end = next.offset };
}
