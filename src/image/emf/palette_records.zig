const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const log_palette_entry = @import("log_palette_entry.zig");

pub const Entries = struct {
    bytes: []const u8,
    count: usize,

    pub fn entry(self: Entries, index: usize) !log_palette_entry.Entry {
        if (index >= self.count) return error.EmfPaletteIndexOutOfBounds;
        return log_palette_entry.parse(self.bytes[index * 4 ..][0..4]);
    }
};

pub const Create = struct { handle: u32, entries: Entries };
pub const SetEntries = struct { handle: u32, start: u32, entries: Entries };
pub const Resize = struct { handle: u32, entries: u32 };
pub const default_palette: u32 = 0x8000000f;

pub const Value = union(enum) {
    create: Create,
    select: u32,
    set_entries: SetEntries,
    resize: Resize,
    realize,
};

fn requiredArrayEnd(base: usize, count: u32, actual: usize) !usize {
    const expected = @as(u64, base) + @as(u64, count) * 4;
    if (expected > std.math.maxInt(usize) or expected > actual) return error.InvalidEmfPaletteRecordSize;
    return @intCast(expected);
}

fn validateHandle(handle: u32, allow_default: bool) !void {
    if (handle == 0) return error.InvalidEmfPaletteHandle;
    if (handle & 0x80000000 != 0 and !(allow_default and handle == default_palette))
        return error.InvalidEmfPaletteHandle;
}

pub fn parse(record: records.Record) !?Value {
    switch (record.kind) {
        .createpalette => {
            if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfPaletteRecordSize;
            const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
            try validateHandle(handle, false);
            if (std.mem.readInt(u16, record.bytes[12..14], .little) != 0x0300) return error.InvalidEmfLogPaletteVersion;
            const count = std.mem.readInt(u16, record.bytes[14..16], .little);
            if (count == 0) return error.EmptyEmfLogPalette;
            const entries_end = try requiredArrayEnd(16, count, record.bytes.len);
            return .{ .create = .{ .handle = handle, .entries = .{ .bytes = record.bytes[16..entries_end], .count = count } } };
        },
        .selectpalette => {
            if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfPaletteRecordSize;
            const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
            try validateHandle(handle, true);
            return .{ .select = handle };
        },
        .setpaletteentries => {
            if (!record_extent.hasRequiredPrefix(record, 20)) return error.InvalidEmfPaletteRecordSize;
            const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
            try validateHandle(handle, false);
            const count = std.mem.readInt(u32, record.bytes[16..20], .little);
            const entries_end = try requiredArrayEnd(20, count, record.bytes.len);
            return .{ .set_entries = .{
                .handle = handle,
                .start = std.mem.readInt(u32, record.bytes[12..16], .little),
                .entries = .{ .bytes = record.bytes[20..entries_end], .count = count },
            } };
        },
        .resizepalette => {
            if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfPaletteRecordSize;
            const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
            try validateHandle(handle, false);
            const count = std.mem.readInt(u32, record.bytes[12..16], .little);
            if (count == 0 or count > 0x400) return error.InvalidEmfPaletteEntryCount;
            return .{ .resize = .{ .handle = handle, .entries = count } };
        },
        .realizepalette => {
            if (!record_extent.hasRequiredPrefix(record, 8)) return error.InvalidEmfPaletteRecordSize;
            return .realize;
        },
        else => return null,
    }
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "create palette validates version count and entry wire order" {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[8..12], 7, .little);
    std.mem.writeInt(u16, bytes[12..14], 0x0300, .little);
    std.mem.writeInt(u16, bytes[14..16], 2, .little);
    bytes[16..24].* = .{ 9, 30, 20, 10, 8, 60, 50, 40 };
    const value = (try parse(fixture(.createpalette, &bytes))).?.create;
    try std.testing.expectEqual(@as(u32, 7), value.handle);
    try std.testing.expectEqual(@as(usize, 2), value.entries.count);
    const second = try value.entries.entry(1);
    try std.testing.expectEqual(@as(u8, 8), second.reserved);
    try std.testing.expectEqual(@as(u8, 60), second.blue);

    std.mem.writeInt(u16, bytes[12..14], 0x0200, .little);
    try std.testing.expectError(error.InvalidEmfLogPaletteVersion, parse(fixture(.createpalette, &bytes)));
    std.mem.writeInt(u16, bytes[12..14], 0x0300, .little);
    std.mem.writeInt(u16, bytes[14..16], 0, .little);
    try std.testing.expectError(error.EmptyEmfLogPalette, parse(fixture(.createpalette, &bytes)));
}

test "palette entry arrays require count-derived prefixes and exclude trailing data" {
    var create = [_]u8{0} ** 20;
    std.mem.writeInt(u32, create[8..12], 1, .little);
    std.mem.writeInt(u16, create[12..14], 0x0300, .little);
    std.mem.writeInt(u16, create[14..16], 2, .little);
    try std.testing.expectError(error.InvalidEmfPaletteRecordSize, parse(fixture(.createpalette, &create)));

    var extended_create = [_]u8{0} ** 28;
    std.mem.writeInt(u32, extended_create[8..12], 1, .little);
    std.mem.writeInt(u16, extended_create[12..14], 0x0300, .little);
    std.mem.writeInt(u16, extended_create[14..16], 2, .little);
    const created = (try parse(fixture(.createpalette, &extended_create))).?.create;
    try std.testing.expectEqual(@as(usize, 8), created.entries.bytes.len);

    var set = [_]u8{0} ** 24;
    std.mem.writeInt(u32, set[8..12], 1, .little);
    std.mem.writeInt(u32, set[12..16], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, set[16..20], 1, .little);
    const value = (try parse(fixture(.setpaletteentries, &set))).?.set_entries;
    try std.testing.expectEqual(std.math.maxInt(u32), value.start);
    try std.testing.expectEqual(@as(usize, 1), value.entries.count);
    try std.testing.expectEqual(@as(usize, 4), value.entries.bytes.len);
    std.mem.writeInt(u32, set[16..20], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfPaletteRecordSize, parse(fixture(.setpaletteentries, &set)));
}

test "select resize and realize enforce their scalar contracts" {
    var select = [_]u8{0} ** 12;
    std.mem.writeInt(u32, select[8..12], default_palette, .little);
    try std.testing.expectEqual(default_palette, (try parse(fixture(.selectpalette, &select))).?.select);
    for ([_]u32{ 0, 0x80000000, 0x8000000e, 0xffffffff }) |handle| {
        std.mem.writeInt(u32, select[8..12], handle, .little);
        try std.testing.expectError(error.InvalidEmfPaletteHandle, parse(fixture(.selectpalette, &select)));
    }

    var resize = [_]u8{0} ** 16;
    std.mem.writeInt(u32, resize[8..12], 1, .little);
    for ([_]u32{ 1, 0x400 }) |count| {
        std.mem.writeInt(u32, resize[12..16], count, .little);
        try std.testing.expectEqual(count, (try parse(fixture(.resizepalette, &resize))).?.resize.entries);
    }
    for ([_]u32{ 0, 0x401, std.math.maxInt(u32) }) |count| {
        std.mem.writeInt(u32, resize[12..16], count, .little);
        try std.testing.expectError(error.InvalidEmfPaletteEntryCount, parse(fixture(.resizepalette, &resize)));
    }
    std.mem.writeInt(u32, resize[8..12], default_palette, .little);
    try std.testing.expectError(error.InvalidEmfPaletteHandle, parse(fixture(.resizepalette, &resize)));

    const realize = [_]u8{0} ** 8;
    try std.testing.expectEqual(Value.realize, (try parse(fixture(.realizepalette, &realize))).?);
}

test "palette records require matching declared and physical sizes and accept trailing data" {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    var mismatched = fixture(.selectpalette, &bytes);
    mismatched.size = 16;
    try std.testing.expectError(error.InvalidEmfPaletteRecordSize, parse(mismatched));
    try std.testing.expectEqual(Value.realize, (try parse(fixture(.realizepalette, &bytes))).?);
    try std.testing.expect((try parse(fixture(.savedc, bytes[0..8]))) == null);
}
