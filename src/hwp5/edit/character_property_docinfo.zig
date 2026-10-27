//! Clone a character resource; original records remain byte-exact.
const std = @import("std");
const Version = @import("../version.zig").Version;
const mappings = @import("../docinfo/id_mappings.zig");
const payload_writer = @import("character_property_payload.zig");
const Tag = @import("../docinfo/reader.zig").Tag;
pub const Result = struct { bytes: []u8, id: u32 };
const underline_writer = @import("character_underline_payload.zig");
const Mutation = union(enum) { properties: payload_writer.Patch, underline: underline_writer.Kind };
pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, patch: payload_writer.Patch, limit: usize) !Result {
    if (patch.border_fill) |border| {
        var it = @import("../record.zig").Iterator.init(input, .{});
        var n: u32 = 0;
        var source: ?[]const u8 = null;
        while (try it.next()) |record| if (record.tag == @backingInt(Tag.char_shape)) {
            if (n == source_id) source = record.payload;
            n += 1;
        };
        const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(source orelse return error.InvalidCharacterShapeReference, version);
        const ref = shape.border_fill_id orelse return error.MissingBorderFillReference;
        const fill = try @import("border_fill_docinfo_patch.zig").write(a, input, version, ref, border, limit);
        defer a.free(fill.bytes);
        var without = patch;
        without.border_fill = null;
        const character = try cloneResource(a, fill.bytes, version, source_id, .{ .properties = without }, limit);
        errdefer a.free(character.bytes);
        var result_it = @import("../record.zig").Iterator.init(character.bytes, .{});
        n = 0;
        while (try result_it.next()) |record| if (record.tag == @backingInt(Tag.char_shape)) {
            if (n == character.id) {
                const offset = record.offset + record.raw.len - record.payload.len + @import("../docinfo/char_shape.zig").CharShape.border_fill_offset;
                if (record.payload.len < 70) return error.MissingBorderFillReference;
                std.mem.writeInt(u16, character.bytes[offset..][0..2], fill.id, .little);
                return character;
            }
            n += 1;
        };
        return error.InvalidCharacterShapeReference;
    }
    return cloneResource(a, input, version, source_id, .{ .properties = patch }, limit);
}
pub fn writeUnderline(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, kind: underline_writer.Kind, limit: usize) !Result {
    return cloneResource(a, input, version, source_id, .{ .underline = kind }, limit);
}
fn cloneResource(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, mutation: Mutation, limit: usize) !Result {
    if (input.len > limit) return error.LimitExceeded;
    var iterator = @import("../record.zig").Iterator.init(input, .{});
    var mapping_offset: ?usize = null;
    var declared: i32 = 0;
    var count: usize = 0;
    var template: ?[]const u8 = null;
    var insertion: ?usize = null;
    var within_shape = false;
    while (try iterator.next()) |record| {
        if (record.tag == @backingInt(Tag.id_mappings)) {
            if (mapping_offset != null) return error.DuplicateIdMappings;
            if (record.level != 0) return error.InvalidDocInfoLevel;
            const map = try mappings.IdMappings.parse(record.payload, version);
            declared = map.get(.char_shape).?;
            mapping_offset = record.offset + record.raw.len - record.payload.len + @backingInt(mappings.Field.char_shape) * 4;
        }
        if (record.tag == @backingInt(Tag.char_shape)) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            _ = try @import("../docinfo/char_shape.zig").CharShape.parse(record.payload, version);
            if (count == source_id) template = record.payload;
            count += 1;
            insertion = record.offset + record.raw.len;
            within_shape = true;
        } else if (within_shape) {
            if (record.level > 1) insertion = record.offset + record.raw.len else within_shape = false;
        }
    }
    const offset = mapping_offset orelse return error.MissingIdMappings;
    if (declared < 0) return error.NegativeMappingCount;
    if (@as(usize, @intCast(declared)) != count) return error.ResourceCountMismatch;
    const source = template orelse return error.InvalidCharacterShapeReference;
    const payload = switch (mutation) {
        .properties => |patch| try payload_writer.write(a, source, version, patch, limit),
        .underline => |kind| try underline_writer.write(a, source, version, kind, limit),
    };
    defer a.free(payload);
    return .{ .bytes = try @import("docinfo_resource_append.zig").write(a, input, insertion.?, offset, declared, @backingInt(Tag.char_shape), payload, limit), .id = @intCast(count) };
}

test "HWP5 character property DocInfo clones actual resource without changing existing records" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
    defer a.free(decoded);
    const result = try write(a, decoded, source.header.version(), 0, .{ .size = 2400, .italic = true }, 4_000_000);
    defer a.free(result.bytes);
    var original = @import("../record.zig").Iterator.init(decoded, .{});
    var saved = @import("../record.zig").Iterator.init(result.bytes, .{});
    var index: u32 = 0;
    var inserted = false;
    while (try saved.next()) |record| {
        if (record.tag == @backingInt(Tag.char_shape)) {
            if (index == result.id) {
                const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(record.payload, source.header.version());
                try std.testing.expectEqual(@as(i32, 2400), shape.size);
                try std.testing.expectEqual(@as(u32, 1), shape.attributes & 1);
                inserted = true;
                continue;
            }
            index += 1;
        }
        const before = (try original.next()).?;
        if (record.tag == @backingInt(Tag.id_mappings)) {
            try std.testing.expectEqualSlices(u8, before.payload[0..36], record.payload[0..36]);
            try std.testing.expectEqualSlices(u8, before.payload[40..], record.payload[40..]);
            try std.testing.expectEqual(std.mem.readInt(i32, before.payload[36..40], .little) + 1, std.mem.readInt(i32, record.payload[36..40], .little));
        } else try std.testing.expectEqualSlices(u8, before.raw, record.raw);
    }
    try std.testing.expect(inserted);
    try std.testing.expect((try original.next()) == null);
}

test "HWP5 character property DocInfo preserves opaque records and allocation failures" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var map: [60]u8 = @splat(0);
    std.mem.writeInt(i32, map[36..40], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &input, 17, 0, &map, 4096);
    try append(a, &input, 21, 1, &@as([68]u8, @splat(0)), 4096);
    try append(a, &input, 999, 2, "opaque child", 4096);
    const at = input.items.len;
    try append(a, &input, 998, 1, "opaque next", 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, boundary: usize) !void {
            const result = try write(allocator, source, .{ .raw = 0x05000000 }, 0, .{ .size = 1200, .bold = true }, 4096);
            defer allocator.free(result.bytes);
            try std.testing.expectEqual(@as(u32, 1), result.id);
            var expected: std.ArrayList(u8) = .empty;
            defer expected.deinit(allocator);
            try expected.appendSlice(allocator, source[0..boundary]);
            var clone: [68]u8 = @splat(0);
            std.mem.writeInt(i32, clone[42..46], 1200, .little);
            clone[46] = 2;
            try @import("../record_writer.zig").append(allocator, &expected, 21, 1, &clone, 4096);
            try expected.appendSlice(allocator, source[boundary..]);
            std.mem.writeInt(i32, expected.items[40..44], 2, .little);
            try std.testing.expectEqualSlices(u8, expected.items, result.bytes);
        }
    }.run, .{ input.items, at });
    try std.testing.expectError(error.InvalidCharacterShapeReference, write(a, input.items, .{ .raw = 0x05000000 }, 1, .{}, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, input.items, .{ .raw = 0x05000000 }, 0, .{}, input.items.len));
}
