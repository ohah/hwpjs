const std = @import("std");
const codec = @import("hwp5/edit/drawing_sections_migration.zig");
const values: codec.Values = .{ .shadow = .{ .kind = 0, .color = 0x12345678, .offset_x = -720, .offset_y = 1440 }, .metadata_reserved = 0, .shadow_alpha = 255 };
const from: @import("hwp5/version.zig").Version = .{ .raw = 0x05000107 };
const to: @import("hwp5/version.zig").Version = .{ .raw = 0x05000300 };

fn load(a: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
    defer a.free(path);
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqual(from.raw, source.header.version().raw);
    try std.testing.expectEqual(@as(usize, 1), source.section_count);
    return source.decodeSection(a, 0);
}

fn verify(sources: []const []const u8, result: codec.Draft) !void {
    try std.testing.expectEqual(from.raw, result.source_version.raw);
    try std.testing.expectEqual(to.raw, result.target_version.raw);
    try std.testing.expect(!result.complete_document);
    try std.testing.expectEqual(@as(usize, 17), result.converted_styles);
    try std.testing.expectEqual(sources.len, result.sections.len);
    var ids: [17]u32 = undefined;
    var count: usize = 0;
    for (sources, result.sections) |original, current| {
        var before = @import("hwp5/record.zig").Iterator.init(original, .{});
        var after = @import("hwp5/record.zig").Iterator.init(current, .{});
        while (try before.next()) |old| {
            const new = (try after.next()) orelse return error.MissingMigratedRecord;
            try std.testing.expectEqual(old.tag, new.tag);
            try std.testing.expectEqual(old.level, new.level);
            if (old.tag != 76) {
                try std.testing.expectEqualSlices(u8, old.raw, new.raw);
                continue;
            }
            try std.testing.expectEqual(old.payload.len + 22, new.payload.len);
            try std.testing.expectEqualSlices(u8, old.payload, new.payload[0..old.payload.len]);
            const suffix = new.payload[old.payload.len..];
            try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0, 0, 0x78, 0x56, 0x34, 0x12, 0x30, 0xfd, 0xff, 0xff, 0xa0, 5, 0, 0 }, suffix[0..16]);
            const id = std.mem.readInt(u32, suffix[16..20], .little);
            try std.testing.expect(id > 3);
            try std.testing.expect(std.mem.indexOfScalar(u32, ids[0..count], id) == null);
            ids[count] = id;
            count += 1;
            try std.testing.expectEqualSlices(u8, &.{ 0, 255 }, suffix[20..22]);
            for (sources) |source| {
                var records = @import("hwp5/record.zig").Iterator.init(source, .{});
                while (try records.next()) |record| {
                    if (record.tag == 66) try std.testing.expect(id != std.mem.readInt(u32, record.payload[18..22], .little));
                    if (record.tag == 71) {
                        const control = try @import("hwp5/body/control_header.zig").Header.parse(record.payload);
                        if (@import("hwp5/body/object_common.zig").supports(control.id)) try std.testing.expect(id != std.mem.readInt(u32, control.properties[32..36], .little));
                    }
                }
            }
        }
        try std.testing.expect(try after.next() == null);
    }
    try std.testing.expectEqual(@as(usize, 17), count);
}

test "drawing Section migration assembles actual components with global IDs raw preservation and every allocation failure" {
    const a = std.testing.allocator;
    const first = try load(a, "aligns");
    defer a.free(first);
    const second = try load(a, "multicolumns-in-common-controls");
    defer a.free(second);
    const before_first = try a.dupe(u8, first);
    defer a.free(before_first);
    const before_second = try a.dupe(u8, second);
    defer a.free(before_second);
    const sources = [_][]const u8{ first, second };
    var result = try codec.prepare(a, &sources, from, to, &.{ 1, 2, 3 }, values, 10000, 4_000_000);
    defer result.deinit(a);
    try verify(&sources, result);
    try std.testing.expectEqual(first.len + 16 * 22, result.sections[0].len);
    try std.testing.expectEqual(second.len + 22, result.sections[1].len);
    const total = result.sections[0].len + result.sections[1].len;
    var exact = try codec.prepare(a, &sources, from, to, &.{ 1, 2, 3 }, values, 10000, total);
    defer exact.deinit(a);
    try verify(&sources, exact);
    try std.testing.expectError(error.LimitExceeded, codec.prepare(a, &sources, from, to, &.{ 1, 2, 3 }, values, 10000, total - 1));
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: []const []const u8) !void {
            var draft = try codec.prepare(allocator, original, from, to, &.{ 1, 2, 3 }, values, 10000, 4_000_000);
            defer draft.deinit(allocator);
            try verify(original, draft);
        }
    }.run, .{@as([]const []const u8, &sources)});
    try std.testing.expectEqualSlices(u8, before_first, first);
    try std.testing.expectEqualSlices(u8, before_second, second);
}
