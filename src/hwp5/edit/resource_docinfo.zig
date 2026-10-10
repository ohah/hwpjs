//! Compose resource intents once for both saving and display snapshots.
const std = @import("std");
const model = @import("../../model/document.zig");
pub fn write(a: std.mem.Allocator, original: []const u8, version: @import("../version.zig").Version, document: *const model.Document, paragraph_count: usize, character_count: usize, limit: usize) ![]u8 {
    const paragraphs: @import("paragraph_resource_values.zig").Values = .{ .entries = .{ .items = document.paragraph_resources, .capacity = document.paragraph_resources.len } };
    var current = try paragraphs.write(a, original, version, paragraph_count, limit);
    errdefer a.free(current);
    const characters: @import("character_resource_values.zig").Values = .{ .entries = .{ .items = document.character_resources, .capacity = document.character_resources.len } };
    if (document.character_resources.len != 0) {
        const next = try characters.write(a, current, version, character_count, limit);
        a.free(current);
        current = next;
    }
    for (document.font_resources.entries.items) |font| {
        const next = try @import("font_face_docinfo.zig").write(a, current, version, font.language, font.name orelse return error.InvalidFontName, limit, limit);
        if (next.id != font.id) {
            a.free(next.bytes);
            return error.InvalidFontId;
        }
        a.free(current);
        current = next.bytes;
    }
    return current;
}

test "HWP5 resource DocInfo composes character and paragraph intents under allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var input: std.ArrayList(u8) = .empty;
            defer input.deinit(a);
            var mapping: [60]u8 = @splat(0);
            std.mem.writeInt(i32, mapping[36..40], 1, .little);
            std.mem.writeInt(i32, mapping[52..56], 1, .little);
            const append = @import("../record_writer.zig").append;
            try append(a, &input, 17, 0, &mapping, 4096);
            try append(a, &input, 21, 1, &@as([68]u8, @splat(0)), 4096);
            try append(a, &input, 25, 1, &@as([42]u8, @splat(0)), 4096);
            var paragraphs = [_]model.ParagraphResourceIntent{.{ .source_id = 0, .alignment = 3, .margins = .{ .indent = -720 } }};
            var characters = [_]model.CharacterResourceIntent{.{ .source_id = 0, .properties = .{ .size = 1200, .bold = true } }};
            var fonts: @import("../../model/font_resource_values.zig").Values = .{};
            defer fonts.deinit(a);
            _ = try fonts.add(a, .hangul, 0, "New", 3);
            _ = try fonts.add(a, .latin, 0, "Latin", 5);
            const document: model.Document = .{ .format = .hwp5, .sections = &.{}, .paragraph_resources = &paragraphs, .character_resources = &characters, .font_resources = fonts };
            const output = try write(a, input.items, .{ .raw = 0x05000000 }, &document, 1, 1, 4096);
            defer a.free(output);
            const report = try @import("../docinfo/resources.zig").inspect(output, .{ .raw = 0x05000000 }, .{});
            try report.validate();
            try std.testing.expectEqual(@as(i32, 1), report.fontCount(.korean));
            try std.testing.expectEqual(@as(i32, 1), report.fontCount(.english));
            const char_shapes = try @import("character_display_shapes.zig").read(a, output, .{ .raw = 0x05000000 }, 2);
            defer a.free(char_shapes);
            try std.testing.expectEqual(@as(i32, 1200), char_shapes[1].height);
            try std.testing.expect(char_shapes[1].bold);
            const para_shapes = try @import("paragraph_display_shapes.zig").read(a, output, .{ .raw = 0x05000000 }, 2);
            defer a.free(para_shapes);
            try std.testing.expectEqual(@as(u3, 3), para_shapes[1].alignment);
            try std.testing.expectEqual(@as(i32, -720), para_shapes[1].indent);
            try std.testing.expectEqual(@as(i32, 2), std.mem.readInt(i32, output[40..44], .little));
            try std.testing.expectEqual(@as(i32, 2), std.mem.readInt(i32, output[56..60], .little));
            try std.testing.expectEqual(@as(i32, 1), std.mem.readInt(i32, input.items[40..44], .little));
            fonts.entries.items[1].id = 1;
            const invalid: model.Document = .{ .format = .hwp5, .sections = &.{}, .font_resources = fonts };
            const rejected = write(a, input.items, .{ .raw = 0x05000000 }, &invalid, 1, 1, 4096);
            if (rejected) |bytes| {
                a.free(bytes);
                return error.ExpectedInvalidFontId;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectEqual(error.InvalidFontId, err);
            }
        }
    }.run, .{});
}
