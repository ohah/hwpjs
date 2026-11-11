//! Current DocInfo owns ordinal one-based bullet IDs. No body inference or ZIP.
const std = @import("std");
const framing = @import("../record.zig");
const dto = @import("../../model/paragraph_bullet_definition.zig");
const Version = @import("../version.zig").Version;
const Bullet = @import("../docinfo/bullet.zig").Bullet;
const mapping = @import("../docinfo/id_mappings.zig");
pub const Inventory = struct {
    declarations: []dto.Declaration,
    mapping_offset: usize,
    count: usize,
    char_count: usize,
    insertion: usize,
    pub fn deinit(self: Inventory, a: std.mem.Allocator) void {
        a.free(self.declarations);
    }
};
pub fn validate(d: dto.Definition) !void {
    try dto.validate(d);
    if (d.marker > 0xffff) return error.UnrepresentableHwp5BulletMarker;
    if (std.math.cast(i16, d.widthAdjust) == null or std.math.cast(i16, d.textOffset) == null) return error.UnrepresentableHwp5BulletGeometry;
}
fn observed(b: Bullet) ?dto.Definition {
    const alignment = b.head.attributes & 3;
    if (alignment == 3) return null;
    const marker = @import("paragraph_display_shapes.zig").characterBullet(b);
    if (marker == 0) return null;
    const d: dto.Definition = .{ .marker = marker, .alignment = @fromBackingInt(@intCast(alignment)), .useInstanceWidth = b.head.attributes & 4 != 0, .autoIndent = b.head.attributes & 8 != 0, .widthAdjust = b.head.width_adjustment, .textOffsetType = if (b.head.attributes & 16 != 0) .HWPUNIT else .PERCENT, .textOffset = b.head.text_distance, .charShapeId = b.head.char_shape_id };
    validate(d) catch return null;
    return d;
}
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, version: Version) !Inventory {
    var rows: std.ArrayList(dto.Declaration) = .empty;
    errdefer rows.deinit(a);
    var chars: usize = 0;
    var declared: ?i32 = null;
    var declared_chars: ?i32 = null;
    var map_offset: usize = 0;
    var insertion: ?usize = null;
    var within = false;
    var fallback: ?usize = null;
    var it = framing.Iterator.init(bytes, .{});
    while (try it.next()) |r| {
        if (within) {
            if (r.level > 1) insertion = r.offset + r.raw.len else within = false;
        }
        switch (r.tag) {
            17 => {
                if (declared != null) return error.DuplicateIdMappings;
                if (r.level != 0) return error.InvalidDocInfoLevel;
                const m = try mapping.IdMappings.parse(r.payload, version);
                declared = m.get(.bullet).?;
                declared_chars = m.get(.char_shape).?;
                map_offset = r.offset + r.raw.len - r.payload.len + @backingInt(mapping.Field.bullet) * 4;
            },
            21 => {
                if (r.level != 1) return error.InvalidDocInfoLevel;
                chars += 1;
            },
            24 => {
                if (r.level != 1) return error.InvalidDocInfoLevel;
                if (rows.items.len == 4096) return error.LimitExceeded;
                const b = try Bullet.parse(r.payload);
                const marker = @import("paragraph_display_shapes.zig").characterBullet(b);
                const d = observed(b);
                const supported = marker != 0 and d != null;
                try rows.append(a, .{ .ordinal = @intCast(rows.items.len), .id = @intCast(rows.items.len + 1), .marker = if (supported) marker else null, .canApply = supported, .reason = if (supported) null else .UnsupportedBulletDeclaration, .definition = d });
                insertion = r.offset + r.raw.len;
                within = true;
            },
            25, 26 => {
                if (fallback == null) fallback = r.offset;
            },
            else => {},
        }
    }
    const n = declared orelse return error.MissingIdMappings;
    if (n < 0 or declared_chars.? < 0) return error.NegativeMappingCount;
    if (@as(usize, @intCast(n)) != rows.items.len or @as(usize, @intCast(declared_chars.?)) != chars) return error.ResourceCountMismatch;
    // Native uses the complete actual character resource count, never a guessed ID.
    for (rows.items) |*row| if (row.definition) |d| {
        if (d.charShapeId != 0xffffffff and d.charShapeId >= chars) {
            row.canApply = false;
            row.marker = null;
            row.definition = null;
            row.reason = .UnsupportedBulletDeclaration;
        }
    };
    const count = rows.items.len;
    return .{ .declarations = try rows.toOwnedSlice(a), .count = count, .char_count = chars, .mapping_offset = map_offset, .insertion = insertion orelse fallback orelse bytes.len };
}
pub fn read(a: std.mem.Allocator, bytes: []const u8, version: Version) !dto.Snapshot {
    const info = try inspect(a, bytes, version);
    return .{ .declarations = info.declarations };
}
fn patchPayload(a: std.mem.Allocator, original: []const u8, d: dto.Definition) ![]u8 {
    try validate(d);
    var bytes = if (original.len == 0) try a.alloc(u8, 25) else try a.dupe(u8, original);
    errdefer a.free(bytes);
    if (original.len == 0) @memset(bytes, 0) else _ = try Bullet.parse(original);
    const attributes = if (original.len == 0) 0 else std.mem.readInt(u32, bytes[0..4], .little);
    const low: u32 = @backingInt(d.alignment) | (if (d.useInstanceWidth) @as(u32, 4) else 0) | (if (d.autoIndent) @as(u32, 8) else 0) | (if (d.textOffsetType == .HWPUNIT) @as(u32, 16) else 0);
    std.mem.writeInt(u32, bytes[0..4], (attributes & ~@as(u32, 31)) | low, .little);
    std.mem.writeInt(i16, bytes[4..6], @intCast(d.widthAdjust), .little);
    std.mem.writeInt(i16, bytes[6..8], @intCast(d.textOffset), .little);
    std.mem.writeInt(u32, bytes[8..12], d.charShapeId, .little);
    std.mem.writeInt(u16, bytes[12..14], @intCast(d.marker), .little);
    return bytes;
}
/// One input traversal, one output traversal, O(records + declarations + intents).
pub fn write(a: std.mem.Allocator, original: []const u8, version: Version, intents: []const dto.ResourceIntent, limit: usize) ![]u8 {
    if (original.len > limit) return error.LimitExceeded;
    const info = try inspect(a, original, version);
    defer info.deinit(a);
    var added: usize = 0;
    for (intents) |v| {
        if (v.created) added += 1;
        try validate(v.definition);
        if (v.definition.charShapeId != 0xffffffff and v.definition.charShapeId >= info.char_count) return error.InvalidCharacterShapeReference;
    }
    const total = std.math.add(usize, info.count, added) catch return error.LimitExceeded;
    if (total > 4096 or total > std.math.maxInt(u16)) return error.LimitExceeded;
    const by_id = try a.alloc(?*const dto.ResourceIntent, total);
    defer a.free(by_id);
    @memset(by_id, null);
    for (intents) |*v| {
        if (v.id == 0 or v.id > total or v.created != (v.id > info.count)) return error.InvalidBulletId;
        if (by_id[v.id - 1] != null) return error.DuplicateBulletId;
        if (!v.created and info.declarations[v.id - 1].definition == null) return error.UnsupportedBulletDeclaration;
        by_id[v.id - 1] = v;
    }
    for (by_id[info.count..]) |v| if (v == null) return error.InvalidBulletId;
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    var it = framing.Iterator.init(original, .{});
    var id: usize = 0;
    var inserted = false;
    while (try it.next()) |r| {
        if (!inserted and r.offset == info.insertion) {
            try appendNew(a, &output, by_id[info.count..], limit);
            inserted = true;
        }
        if (r.tag == 24) {
            if (by_id[id]) |v| {
                const bytes = try patchPayload(a, r.payload, v.definition);
                defer a.free(bytes);
                // Same-length replacement retains exact original extended header framing.
                try append(a, &output, r.raw[0 .. r.raw.len - r.payload.len], limit);
                try append(a, &output, bytes, limit);
            } else try append(a, &output, r.raw, limit);
            id += 1;
        } else try append(a, &output, r.raw, limit);
    }
    if (!inserted) try appendNew(a, &output, by_id[info.count..], limit);
    const map_offset = info.mapping_offset + (if (info.mapping_offset >= info.insertion) added * 29 else @as(usize, 0));
    std.mem.writeInt(i32, output.items[map_offset..][0..4], @intCast(total), .little);
    return output.toOwnedSlice(a);
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
fn appendNew(a: std.mem.Allocator, out: *std.ArrayList(u8), rows: []?*const dto.ResourceIntent, limit: usize) !void {
    for (rows) |row| {
        const p = try patchPayload(a, "", row.?.definition);
        defer a.free(p);
        try @import("../record_writer.zig").append(a, out, 24, 1, p, limit);
    }
}

const sample: dto.Definition = .{ .marker = 0x2605, .alignment = .RIGHT, .useInstanceWidth = false, .autoIndent = true, .widthAdjust = -50, .textOffsetType = .HWPUNIT, .textOffset = 750, .charShapeId = 0xffffffff };
test "HWP5 bullet DocInfo writer preserves payload tails mapping metadata and allocation failures" {
    const a = std.testing.allocator;
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    var map: [72]u8 = @splat(0);
    std.mem.writeInt(i32, map[48..52], 2, .little);
    map[68] = 37;
    try @import("../record_writer.zig").append(a, &source, 17, 0, &map, 10000);
    const initial = try patchPayload(a, "", sample);
    defer a.free(initial);
    try @import("../record_writer.zig").append(a, &source, 24, 1, initial, 10000);
    const extended = try a.alloc(u8, 28);
    defer a.free(extended);
    @memcpy(extended[0..25], initial);
    @memcpy(extended[25..], "XYZ");
    try @import("../record_writer.zig").append(a, &source, 24, 1, extended, 10000);
    try @import("../record_writer.zig").append(a, &source, 999, 2, "opaque-child", 10000);
    try @import("../record_writer.zig").append(a, &source, 998, 1, "opaque-next", 10000);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(al: std.mem.Allocator, input: []const u8) !void {
            var changed = sample;
            changed.marker = 0x25c6;
            const result = try write(al, input, .{ .raw = 0x05000302 }, &.{ .{ .id = 1, .created = false, .definition = changed }, .{ .id = 3, .created = true, .definition = sample } }, 10000);
            defer al.free(result);
            const snapshot = try read(al, result, .{ .raw = 0x05000302 });
            defer al.free(snapshot.declarations);
            try std.testing.expectEqual(@as(usize, 3), snapshot.declarations.len);
            try std.testing.expectEqualDeep(changed, snapshot.declarations[0].definition.?);
            try std.testing.expectEqualDeep(sample, snapshot.declarations[2].definition.?);
            try std.testing.expect(std.mem.indexOf(u8, result, "XYZ") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "opaque-child") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "opaque-next") != null);
            try std.testing.expectEqual(@as(u8, 37), result[4 + 68]);
        }
    }.run, .{source.items});
    var bad = sample;
    bad.marker = 0x1f600;
    try std.testing.expectError(error.UnrepresentableHwp5BulletMarker, validate(bad));
    bad = sample;
    bad.textOffset = 32768;
    try std.testing.expectError(error.UnrepresentableHwp5BulletGeometry, validate(bad));
    try std.testing.expectError(error.InvalidBulletId, write(a, source.items, .{ .raw = 0x05000302 }, &.{.{ .id = 0, .created = false, .definition = sample }}, 10000));
}

test "HWP5 bullet inventory retains unsupported reserved character and alignment rows" {
    const a = std.testing.allocator;
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    var map: [60]u8 = @splat(0);
    std.mem.writeInt(i32, map[48..52], 3, .little);
    try @import("../record_writer.zig").append(a, &source, 17, 0, &map, 10000);
    const p = try patchPayload(a, "", sample);
    defer a.free(p);
    for (0..3) |i| {
        std.mem.writeInt(u16, p[12..14], if (i == 0) 0xfffe else if (i == 1) 0xffff else 0x2605, .little);
        if (i == 2) std.mem.writeInt(u32, p[0..4], 3, .little);
        try @import("../record_writer.zig").append(a, &source, 24, 1, p, 10000);
    }
    const result = try read(a, source.items, .{ .raw = 0x05000000 });
    defer a.free(result.declarations);
    try std.testing.expectEqual(@as(usize, 3), result.declarations.len);
    for (result.declarations) |row| {
        try std.testing.expect(!row.canApply);
        try std.testing.expectEqual(@as(?u21, null), row.marker);
        try std.testing.expectEqual(@as(?dto.Definition, null), row.definition);
        try std.testing.expectEqual(dto.Reason.UnsupportedBulletDeclaration, row.reason.?);
    }
}
