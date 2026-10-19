test {
    _ = @import("hwp5/docinfo/tests.zig");
    _ = @import("hwp5/docinfo/char_shape.zig");
    _ = @import("hwp5/docinfo/border_fill.zig");
    _ = @import("hwp5/edit/observed_docinfo.zig");
}

test "observed complete saved DocInfo resources retain all 150 incomplete records and count mismatch" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(info);
    const before = try a.dupe(u8, info);
    defer a.free(before);
    const resources = @import("hwp5/docinfo/resources.zig");
    try std.testing.expectError(error.UnexpectedEnd, resources.inspect(info, source.header.version(), .{}));
    const report = try resources.inspectWithDecodingPolicy(info, source.header.version(), .{}, .{
        .caret = .observed_absent,
        .font_type = .observed_short_hft,
        .style_character = .observed_absent,
        .character_tail = .observed_unresolved_four_bytes,
        .fill_additional = .observed_absent,
    });
    try report.validate();
    try std.testing.expectError(error.ResourceCountMismatch, report.validateKnownCounts());
    try std.testing.expectEqual(@as(?i32, 0), report.mappings.get(.bullet));
    try std.testing.expectEqual(@as(usize, 1), report.count(.bullet));
    try std.testing.expectEqual(@as(usize, 1), report.absent_caret_count);
    try std.testing.expectEqual(@as(usize, 31), report.unresolved_font_type_count);
    try std.testing.expectEqual(@as(usize, 50), report.unresolved_style_character_count);
    try std.testing.expectEqual(@as(usize, 55), report.unresolved_character_tail_count);
    try std.testing.expectEqual(@as(usize, 13), report.absent_fill_additional_count);
    try std.testing.expectEqualSlices(u8, before, info);
}

test "observed DocInfo resource policy counts real retained font variants without weakening default scans" {
    const std = @import("std");
    const a = std.testing.allocator;
    const Source = @import("hwp5/text_source.zig").Source;
    const saved_input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(saved_input);
    const original_input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo.hwp", a, .limited(8_000_000));
    defer a.free(original_input);
    var saved = try Source.openReadOnly(a, saved_input);
    defer saved.deinit();
    var original = try Source.openReadOnly(a, original_input);
    defer original.deinit();
    const saved_info = try saved.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(saved_info);
    const original_info = try original.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(original_info);
    const framing = @import("hwp5/record.zig");
    var replacements: std.ArrayList(framing.Record) = .empty;
    defer replacements.deinit(a);
    var iterator = framing.Iterator.init(saved_info, .{});
    while (try iterator.next()) |record| {
        if (record.tag == 16 or record.tag == 19 or record.tag == 26) try replacements.append(a, record);
    }
    var derived: std.ArrayList(u8) = .empty;
    defer derived.deinit(a);
    iterator = framing.Iterator.init(original_info, .{});
    var next: usize = 0;
    while (try iterator.next()) |record| {
        const raw = if (record.tag == 16 or record.tag == 19 or record.tag == 26) replacement: {
            try std.testing.expect(next < replacements.items.len);
            const observed = replacements.items[next];
            try std.testing.expectEqual(record.tag, observed.tag);
            next += 1;
            break :replacement observed.raw;
        } else record.raw;
        try derived.appendSlice(a, raw);
    }
    try std.testing.expectEqual(replacements.items.len, next);
    const resources = @import("hwp5/docinfo/resources.zig");
    try std.testing.expectError(error.UnexpectedEnd, resources.inspect(derived.items, original.header.version(), .{}));
    const report = try resources.inspectWithDecodingPolicy(derived.items, original.header.version(), .{}, .{ .caret = .observed_absent, .font_type = .observed_short_hft, .style_character = .observed_absent });
    try report.validateKnownCounts();
    const baseline = try resources.inspect(original_info, original.header.version(), .{});
    try std.testing.expectEqual(baseline.face_name_count, report.face_name_count);
    try std.testing.expectEqual(baseline.counts, report.counts);
    try std.testing.expectEqual(@as(usize, 31), report.unresolved_font_type_count);
    try std.testing.expectEqual(@as(usize, 1), report.absent_caret_count);
    try std.testing.expectEqual(@as(usize, 50), report.unresolved_style_character_count);
}

test "observed short HFT actual saved fonts keep unresolved bytes and original DocInfo" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(info);
    const before = try a.dupe(u8, info);
    defer a.free(before);
    var framing = @import("hwp5/record.zig").Iterator.init(info, .{});
    var count: usize = 0;
    while (try framing.next()) |record| {
        if (record.tag != 19) continue;
        const font = try @import("hwp5/docinfo/face_name.zig").FaceName.parseWithTypeInfoPolicy(record.payload, .observed_short_hft);
        if (font.unresolved_type_info) |bytes| {
            try std.testing.expect(bytes.len == 4 or bytes.len == 6);
            try std.testing.expect(font.type_info == null);
            try std.testing.expectError(error.UnexpectedEnd, @import("hwp5/docinfo/face_name.zig").FaceName.parse(record.payload));
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 31), count);
    try std.testing.expectEqualSlices(u8, before, info);
}
