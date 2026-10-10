//! Append a paragraph resource without moving or rewriting existing records.
const std = @import("std");
const framing = @import("../record.zig");
const mappings = @import("../docinfo/id_mappings.zig");
const Version = @import("../version.zig").Version;
const Tag = @import("../docinfo/reader.zig").Tag;
pub const Result = struct { bytes: []u8, id: u16 };

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, alignment: u32, limit: usize) !Result {
    return writeWithMargins(a, input, version, source_id, alignment, .{}, limit);
}

pub fn writeWithMargins(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, limit: usize) !Result {
    return writeWithProperties(a, input, version, source_id, alignment, margins, null, limit);
}
pub fn writeWithProperties(a: std.mem.Allocator, input: []const u8, version: Version, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, spacing: ?@import("paragraph_spacing_payload.zig").Spacing, limit: usize) !Result {
    if (input.len > limit) return error.LimitExceeded;
    var iterator = framing.Iterator.init(input, .{});
    var map_offset: ?usize = null;
    var declared: i32 = 0;
    var count: usize = 0;
    var template: ?[]const u8 = null;
    var insertion: ?usize = null;
    var within_shape = false;
    while (try iterator.next()) |record| {
        if (record.tag == @intFromEnum(Tag.id_mappings)) {
            if (map_offset != null) return error.DuplicateIdMappings;
            if (record.level != 0) return error.InvalidDocInfoLevel;
            const map = try mappings.IdMappings.parse(record.payload, version);
            declared = map.get(.para_shape).?;
            map_offset = record.offset + record.raw.len - record.payload.len + @intFromEnum(mappings.Field.para_shape) * 4;
        }
        if (record.tag == @intFromEnum(Tag.para_shape)) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            _ = try @import("../docinfo/para_shape.zig").ParaShape.parse(record.payload, version);
            if (count == source_id) template = record.payload;
            count += 1;
            insertion = record.offset + record.raw.len;
            within_shape = true;
        } else if (within_shape) {
            if (record.level > 1) insertion = record.offset + record.raw.len else within_shape = false;
        }
    }
    const offset = map_offset orelse return error.MissingIdMappings;
    if (declared < 0) return error.NegativeMappingCount;
    if (@as(usize, @intCast(declared)) != count) return error.ResourceCountMismatch;
    if (count > std.math.maxInt(u16)) return error.InvalidParagraphShapeReference;
    var payload = try @import("paragraph_alignment_payload.zig").write(a, template orelse return error.InvalidParagraphShapeReference, version, alignment, limit);
    defer a.free(payload);
    if (margins.left != null or margins.right != null or margins.indent != null or margins.before != null or margins.after != null) {
        const patched = try @import("paragraph_margin_payload.zig").write(a, payload, version, margins, limit);
        a.free(payload);
        payload = patched;
    }
    if (spacing) |value| {
        const patched = try @import("paragraph_spacing_payload.zig").write(a, payload, version, value, limit);
        a.free(payload);
        payload = patched;
    }
    return .{ .bytes = try @import("docinfo_resource_append.zig").write(a, input, insertion.?, offset, declared, @intFromEnum(Tag.para_shape), payload, limit), .id = @intCast(count) };
}

test "HWP5 paragraph alignment DocInfo preserves opaque children and allocation failures" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var map: [60]u8 = @splat(0);
    std.mem.writeInt(i32, map[52..56], 1, .little);
    try @import("../record_writer.zig").append(a, &input, 17, 0, &map, 4096);
    try @import("../record_writer.zig").append(a, &input, 25, 1, &@as([42]u8, @splat(0)), 4096);
    try @import("../record_writer.zig").append(a, &input, 999, 2, "opaque child", 4096);
    const boundary = input.items.len;
    try @import("../record_writer.zig").append(a, &input, 998, 1, "next opaque", 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, at: usize) !void {
            const result = try write(allocator, source, .{ .raw = 0x05000000 }, 0, 3, 4096);
            defer allocator.free(result.bytes);
            try std.testing.expectEqual(@as(u16, 1), result.id);
            try std.testing.expectEqualSlices(u8, source[64..at], result.bytes[64..at]);
            try std.testing.expectEqualSlices(u8, source[at..], result.bytes[at + 46 ..]);
            try std.testing.expectEqual(@as(i32, 2), std.mem.readInt(i32, result.bytes[56..60], .little));
            try std.testing.expectEqual(@as(u32, 12), std.mem.readInt(u32, result.bytes[at + 4 ..][0..4], .little));
        }
    }.run, .{ input.items, boundary });
    try std.testing.expectError(error.InvalidParagraphShapeReference, write(a, input.items, .{ .raw = 0x05000000 }, 1, 3, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, input.items, .{ .raw = 0x05000000 }, 0, 3, input.items.len));
}

test "HWP5 paragraph alignment DocInfo inserts actual resource and reparses counts" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
    defer a.free(decoded);
    const result = try write(a, decoded, source.header.version(), 0, 3, 4_000_000);
    defer a.free(result.bytes);
    var old = framing.Iterator.init(decoded, .{});
    var changed = framing.Iterator.init(result.bytes, .{});
    var para_index: usize = 0;
    var inserted = false;
    while (try changed.next()) |record| {
        if (record.tag == @intFromEnum(Tag.para_shape)) {
            if (para_index == result.id) {
                const shape = try @import("../docinfo/para_shape.zig").ParaShape.parse(record.payload, source.header.version());
                try std.testing.expectEqual(@as(u32, 3), (shape.attributes >> 2) & 7);
                inserted = true;
                continue;
            }
            para_index += 1;
        }
        const previous = (try old.next()).?;
        if (record.tag == @intFromEnum(Tag.id_mappings)) {
            const before = try mappings.IdMappings.parse(previous.payload, source.header.version());
            const after = try mappings.IdMappings.parse(record.payload, source.header.version());
            try std.testing.expectEqual(before.get(.para_shape).? + 1, after.get(.para_shape).?);
            try std.testing.expectEqualSlices(u8, previous.payload[0..52], record.payload[0..52]);
            try std.testing.expectEqualSlices(u8, previous.payload[56..], record.payload[56..]);
        } else try std.testing.expectEqualSlices(u8, previous.raw, record.raw);
    }
    try std.testing.expect(inserted);
    try std.testing.expect((try old.next()) == null);
}

test "HWP5 paragraph margin DocInfo combines signed edits with preserved alignment" {
    const a = std.testing.allocator;
    var original: std.ArrayList(u8) = .empty;
    defer original.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[52..56], 1, .little);
    try @import("../record_writer.zig").append(a, &original, 17, 0, &mapping, 4096);
    var payload: [42]u8 = @splat(0);
    std.mem.writeInt(i32, payload[8..12], 500, .little);
    std.mem.writeInt(i32, payload[24..28], 160, .little);
    try @import("../record_writer.zig").append(a, &original, 25, 1, &payload, 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            const result = try writeWithMargins(allocator, input, .{ .raw = 0x05000000 }, 0, 2, .{ .left = -720, .indent = -2000, .before = 0 }, 4096);
            defer allocator.free(result.bytes);
            const shapes = try @import("paragraph_display_shapes.zig").read(allocator, result.bytes, .{ .raw = 0x05000000 }, 2);
            defer allocator.free(shapes);
            try std.testing.expectEqual(@as(u3, 2), shapes[1].alignment);
            try std.testing.expectEqual(@as(i32, -720), shapes[1].left);
            try std.testing.expectEqual(@as(i32, -2000), shapes[1].indent);
            try std.testing.expectEqual(@as(i32, 0), shapes[1].before);
            try std.testing.expectEqual(@as(i32, 500), shapes[1].right);
            try std.testing.expectEqual(@as(i32, 160), shapes[1].legacy_spacing);
            try std.testing.expectEqual(@as(i32, 0), shapes[0].indent);
            try std.testing.expectEqualSlices(u8, input[64..], result.bytes[64..110]);
        }
    }.run, .{original.items});
}
