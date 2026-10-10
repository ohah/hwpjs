//! Append a language-local font without renumbering existing FACE_NAME records.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Language = @import("../../model/character_fonts.zig").Language;
const Tag = @import("../docinfo/reader.zig").Tag;
pub const Result = struct { bytes: []u8, id: u32 };

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, language: Language, name: []const u8, name_limit: usize, limit: usize) !Result {
    if (input.len > limit) return error.LimitExceeded;
    const report = try @import("../docinfo/resources.zig").inspect(input, version, .{});
    try report.validate();
    const count = report.fontCount(@enumFromInt(@intFromEnum(language)));
    if (count > std.math.maxInt(u16)) return error.InvalidFontId;
    var boundary: usize = 0;
    for (0..@as(usize, @intFromEnum(language)) + 1) |index| boundary += @intCast(report.fontCount(@enumFromInt(index)));
    var iterator = @import("../record.zig").Iterator.init(input, .{});
    var mapping_offset: ?usize = null;
    var fallback: ?usize = null;
    var insertion: ?usize = null;
    var fonts: usize = 0;
    var selected_owner = false;
    var bin_owner = false;
    while (try iterator.next()) |record| {
        if (record.tag == @intFromEnum(Tag.id_mappings)) {
            if (record.level != 0) return error.InvalidDocInfoLevel;
            mapping_offset = record.offset + record.raw.len - record.payload.len + (1 + @as(usize, @intFromEnum(language))) * 4;
            if (fallback == null) fallback = record.offset + record.raw.len;
        }
        if (record.tag == @intFromEnum(Tag.bin_data)) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            fallback = record.offset + record.raw.len;
            bin_owner = true;
        } else if (bin_owner) {
            if (record.level > 1) fallback = record.offset + record.raw.len else bin_owner = false;
        }
        if (record.tag == @intFromEnum(Tag.face_name)) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            if (boundary == 0 and insertion == null) insertion = record.offset;
            fonts += 1;
            selected_owner = boundary != 0 and fonts == boundary;
            if (selected_owner) insertion = record.offset + record.raw.len;
        } else if (selected_owner) {
            if (record.level > 1) insertion = record.offset + record.raw.len else selected_owner = false;
        }
    }
    const at = insertion orelse if (report.face_name_count == 0) fallback orelse return error.MissingIdMappings else return error.ResourceCountMismatch;
    const payload = try @import("font_face_payload.zig").write(a, name, name_limit, limit);
    defer a.free(payload);
    return .{ .id = @intCast(count), .bytes = try @import("docinfo_resource_append.zig").write(a, input, at, mapping_offset orelse return error.MissingIdMappings, count, @intFromEnum(Tag.face_name), payload, limit) };
}

test "font DocInfo creates first font after binary resource opaque children" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[0..4], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &input, 17, 0, &mapping, 4096);
    try append(a, &input, 18, 1, &.{ 0, 0, 0, 0, 0, 0 }, 4096);
    try append(a, &input, 999, 2, "binary child", 4096);
    const boundary = input.items.len;
    try append(a, &input, 998, 1, "next", 4096);
    const output = try write(a, input.items, .{ .raw = 0x05000000 }, .user, "New", 3, 4096);
    defer a.free(output.bytes);
    var expected: std.ArrayList(u8) = .empty;
    defer expected.deinit(a);
    try expected.appendSlice(a, input.items[0..boundary]);
    try append(a, &expected, 19, 1, &.{ 0, 3, 0, 'N', 0, 'e', 0, 'w', 0 }, 4096);
    try expected.appendSlice(a, input.items[boundary..]);
    std.mem.writeInt(i32, expected.items[4 + 28 ..][0..4], 1, .little);
    try std.testing.expectEqualSlices(u8, expected.items, output.bytes);
}

test "font DocInfo inserts into seven independent language boundaries preserving opaque children" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[8..12], 1, .little);
    std.mem.writeInt(i32, mapping[16..20], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &input, 17, 0, &mapping, 4096);
    try append(a, &input, 19, 1, &.{ 0, 1, 0, 'A', 0 }, 4096);
    try append(a, &input, 999, 2, "opaque child", 4096);
    try append(a, &input, 19, 1, &.{ 0, 1, 0, 'B', 0 }, 4096);
    try append(a, &input, 998, 1, "opaque next", 4096);
    for (0..7) |language| {
        const output = try write(a, input.items, .{ .raw = 0x05000000 }, @enumFromInt(language), "New", 3, 4096);
        defer a.free(output.bytes);
        const expected_id: u32 = if (language == 1 or language == 3) 1 else 0;
        try std.testing.expectEqual(expected_id, output.id);
        const report = try @import("../docinfo/resources.zig").inspect(output.bytes, .{ .raw = 0x05000000 }, .{});
        try report.validate();
        const ordinal = (try report.fontOrdinal(@enumFromInt(language), output.id)).?;
        var result = @import("../record.zig").Iterator.init(output.bytes, .{});
        var original = @import("../record.zig").Iterator.init(input.items, .{});
        var font_index: usize = 0;
        while (try result.next()) |record| {
            if (record.tag == 19) {
                defer font_index += 1;
                if (font_index == ordinal) {
                    try std.testing.expectEqualSlices(u8, &.{ 0, 3, 0, 'N', 0, 'e', 0, 'w', 0 }, record.payload);
                    continue;
                }
            }
            const before = (try original.next()).?;
            if (record.tag == 17) {
                var expected = mapping;
                std.mem.writeInt(i32, expected[(1 + language) * 4 ..][0..4], @intCast(expected_id + 1), .little);
                try std.testing.expectEqualSlices(u8, &expected, record.payload);
            } else try std.testing.expectEqualSlices(u8, before.raw, record.raw);
        }
        try std.testing.expect((try original.next()) == null);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05000000 }, .hanja, "New", 3, 4096);
            defer allocator.free(output.bytes);
        }
    }.run, .{input.items});
}
