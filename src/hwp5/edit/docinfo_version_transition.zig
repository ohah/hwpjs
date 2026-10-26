//! Read-only selected schema transition diagnostics, not conversion permission.
const std = @import("std");
const Version = @import("../version.zig").Version;
const info = @import("../docinfo/reader.zig");
pub const Row = struct {
    ordinal: usize,
    offset: usize,
    tag: u10,
    kind: enum { mappings, character, paragraph, numbering },
    bytes: usize,
    source_known_bytes: usize = 0,
    target_known_bytes: ?usize = null,
    reinterpreted_bytes: ?usize = null,
    absent_profile_bytes: ?usize = null,
    source_expected_fields: ?usize = null,
    target_expected_fields: ?usize = null,
    existing_fields: ?usize = null,
    existing_memo_count: ?i32 = null,
    target_error: ?[]const u8 = null,
};
pub const Report = struct {
    scope: enum { selected_docinfo_payloads } = .selected_docinfo_payloads,
    conversion_authorized: bool = false,
    rows: []Row,
    records: usize,
    unexamined_records: usize,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.rows);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, raw: []const u8, from: Version, to: Version) !Report {
    try from.requireSupported();
    if (to.raw != 0x05000300 or from.raw > to.raw) return error.UnsupportedDocInfoTransitionTarget;
    var iterator = @import("../record.zig").Iterator.init(raw, .{});
    var rows: std.ArrayList(Row) = .empty;
    errdefer rows.deinit(a);
    var count: usize = 0;
    var unexamined: usize = 0;
    while (try iterator.next()) |record| {
        const ordinal = count;
        count += 1;
        const kind: @FieldType(Row, "kind") = switch (record.tag) {
            17 => .mappings,
            21 => .character,
            23 => .numbering,
            25 => .paragraph,
            else => {
                unexamined += 1;
                continue;
            },
        };
        const row: Row = .{ .ordinal = ordinal, .offset = record.offset, .tag = record.tag, .kind = kind, .bytes = record.payload.len };
        const selected = switch (kind) {
            .mappings => try inspect(info.IdMappings, row, record.payload, from, to),
            .character => try inspect(info.CharShape, row, record.payload, from, to),
            .numbering => try inspect(info.Numbering, row, record.payload, from, to),
            .paragraph => try inspect(info.ParaShape, row, record.payload, from, to),
        };
        try rows.append(a, selected);
    }
    return .{ .rows = try rows.toOwnedSlice(a), .records = count, .unexamined_records = unexamined };
}

fn extra(comptime T: type, value: T) usize {
    return if (T == info.IdMappings) value.extra().len else value.extra.len;
}

fn inspect(comptime T: type, initial: Row, bytes: []const u8, from: Version, to: Version) !Row {
    var row = initial;
    const original = try T.parse(bytes, from);
    row.source_known_bytes = bytes.len - extra(T, original);
    const target = T.parse(bytes, to) catch |err| {
        row.target_error = @errorName(err); // Static error name; never borrows input.
        return row;
    };
    row.target_known_bytes = bytes.len - extra(T, target);
    row.reinterpreted_bytes = row.target_known_bytes.? -| row.source_known_bytes;
    if (T == info.IdMappings) {
        row.existing_fields = original.count();
        row.existing_memo_count = original.get(.memo_shape);
        row.source_expected_fields = original.expectedCount();
        row.target_expected_fields = target.expectedCount();
        row.absent_profile_bytes = (target.expectedCount() -| target.count()) * 4;
    } else if (T == info.CharShape) {
        row.absent_profile_bytes = @as(usize, if (target.border_fill_id == null) 2 else 0) + @as(usize, if (target.strike_color == null) 4 else 0);
    } else if (T == info.ParaShape) {
        row.absent_profile_bytes = @as(usize, if (target.attributes2 == null) 4 else 0) + @as(usize, if (target.modern_spacing == null) 8 else 0);
    } else if (T == info.Numbering) {
        row.absent_profile_bytes = if (target.starts == null) 7 * 4 else 0;
    }
    return row;
}
