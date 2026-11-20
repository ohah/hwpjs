//! Independent fixed wire expectations for fresh authored HWP5 profiles.
const std = @import("std");
const root = @import("root.zig");
const cfb = @import("../cfb/reader.zig");
const hwp = @import("../hwp5/root.zig");
const a = std.testing.allocator;

test "new document HWP5 profiles emit complete gated records and preserve prior body controls" {
    const modern = try root.hwp5(a);
    defer a.free(modern);
    const explicit = try root.hwp5WithProfile(a, .modern_5_0_3_0);
    defer a.free(explicit);
    try std.testing.expectEqualSlices(u8, modern, explicit);
    const legacy = try root.hwp5WithProfile(a, .legacy_5_0_1_7);
    defer a.free(legacy);
    var old = try cfb.File.open(a, legacy, .{ .strict = true });
    defer old.deinit();
    var current = try cfb.File.open(a, modern, .{ .strict = true });
    defer current.deinit();
    // Legacy stays byte-exact against the separate canonical-factory oracle.
    // Modern only adds the explicit section children; all prior records must
    // retain their order/level/payload, including the two control tokens.
    var previous_body = hwp.record.Iterator.init(try old.readStream(a, "/BodyText/Section0"), .{});
    var modern_body = hwp.record.Iterator.init(try current.readStream(a, "/BodyText/Section0"), .{});
    var additions: usize = 0;
    while (try modern_body.next()) |record| {
        if (record.tag == 74 or record.tag == 75) {
            additions += 1;
            continue;
        }
        const previous = (try previous_body.next()) orelse return error.UnexpectedModernBodyRecord;
        try std.testing.expectEqual(previous.tag, record.tag);
        try std.testing.expectEqual(previous.level, record.level);
        try std.testing.expectEqualSlices(u8, previous.payload, record.payload);
    }
    try std.testing.expect((try previous_body.next()) == null);
    try std.testing.expectEqual(@as(usize, 3), additions);
    for ([_][]const u8{ legacy, modern }, [_]u32{ 0x05000107, 0x05000300 }) |bytes, expected_version| {
        var file = try cfb.File.open(a, bytes, .{ .strict = true });
        defer file.deinit();
        const header = try hwp.Header.parse(try file.readStream(a, "/FileHeader"));
        try std.testing.expectEqual(expected_version, header.version().raw);
        const is_modern = expected_version == 0x05000300;
        const doc = try file.readStream(a, "/DocInfo");
        var records = hwp.record.Iterator.init(doc, .{});
        var found: usize = 0;
        while (try records.next()) |record| switch (record.tag) {
            17 => {
                try std.testing.expectEqual(@as(usize, if (is_modern) 64 else 60), record.payload.len);
                const mapping = try @import("../hwp5/docinfo/id_mappings.zig").IdMappings.parse(record.payload, header.version());
                try std.testing.expectEqual(mapping.expectedCount(), mapping.count());
                try std.testing.expectEqual(@as(?i32, if (is_modern) 0 else null), mapping.get(.memo_shape));
                try std.testing.expect(mapping.get(.track_change) == null);
                try std.testing.expect(mapping.get(.track_change_author) == null);
                found += 1;
            },
            21 => {
                try std.testing.expectEqual(@as(usize, if (is_modern) 74 else 68), record.payload.len);
                const shape = try @import("../hwp5/docinfo/char_shape.zig").CharShape.parse(record.payload, header.version());
                try std.testing.expectEqual(@as(?u16, if (is_modern) 0 else null), shape.border_fill_id);
                try std.testing.expectEqual(@as(?u32, if (is_modern) 0 else null), shape.strike_color);
                try std.testing.expectEqual(@as(u32, 0), shape.underline_color);
                try std.testing.expectEqual(@as(u3, 0), shape.strikeKindRaw());
                try std.testing.expectEqual(@as(usize, 0), shape.extra.len);
                found += 1;
            },
            25 => {
                try std.testing.expectEqual(@as(usize, if (is_modern) 54 else 46), record.payload.len);
                const shape = try @import("../hwp5/docinfo/para_shape.zig").ParaShape.parse(record.payload, header.version());
                try std.testing.expectEqual(@as(?u32, 0), shape.attributes2);
                try std.testing.expectEqual(@as(i32, 160), shape.legacy_spacing);
                if (is_modern) {
                    try std.testing.expectEqual(@as(u32, 0), shape.modern_spacing.?.attributes);
                    try std.testing.expectEqual(@as(i32, 160), shape.modern_spacing.?.value);
                } else try std.testing.expect(shape.modern_spacing == null);
                try std.testing.expect(shape.level == null);
                try std.testing.expectEqual(@as(usize, 0), shape.extra.len);
                found += 1;
            },
            else => {},
        };
        try std.testing.expectEqual(@as(usize, 3), found);
        var body = hwp.record.Iterator.init(try file.readStream(a, "/BodyText/Section0"), .{});
        var sections: usize = 0;
        var paragraphs: usize = 0;
        while (try body.next()) |record| {
            if (record.tag == 66) {
                try std.testing.expectEqual(@as(usize, 22), record.payload.len);
                const paragraph = try @import("../hwp5/body/paragraph_header.zig").Header.parse(record.payload, header.version());
                try std.testing.expect(paragraph.merge_tracking == null);
                try std.testing.expectEqual(@as(usize, 0), paragraph.extra.len);
                paragraphs += 1;
            }
            if (record.tag == 71 and record.payload.len >= 4 and std.mem.readInt(u32, record.payload[0..4], .little) == @import("../hwp5/body/control_rules.zig").section_id) {
                try std.testing.expectEqual(@as(usize, 30), record.payload.len);
                const section = try @import("../hwp5/body/section_def.zig").Definition.parse(record.payload[4..], header.version());
                try std.testing.expectEqual(@as(?u16, 1042), section.language);
                try std.testing.expectEqual(@as(usize, 0), section.extra.len);
                sections += 1;
            }
        }
        try std.testing.expectEqual(@as(usize, 1), paragraphs);
        try std.testing.expectEqual(@as(usize, 1), sections);
    }
}

test "new document HWP5 profile constructors release every allocation failure independently" {
    inline for (.{ root.Hwp5Profile.legacy_5_0_1_7, root.Hwp5Profile.modern_5_0_3_0 }) |profile| {
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator) !void {
                const bytes = try root.hwp5WithProfile(allocator, profile);
                defer allocator.free(bytes);
            }
        }.run, .{});
    }
}
