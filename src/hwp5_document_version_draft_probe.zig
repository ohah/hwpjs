const std = @import("std");
const codec = @import("hwp5/edit/document_version_draft.zig");
const options: codec.Options = .{
    .docinfo = .{ .character = .{ .border_fill_id = 0, .inactive_strike_color = 0 } },
    .drawings = .{ .shadow = .{ .kind = 0, .color = 0, .offset_x = 0, .offset_y = 0 }, .metadata_reserved = 0, .shadow_alpha = 0 },
    .current_and_reserved = &.{ 1, 2, 3 },
};

fn allocationDraftCase(allocator: std.mem.Allocator, original: []const u8, wanted: codec.Draft) !void {
    var result = try codec.prepare(allocator, original, options);
    defer result.deinit(allocator);
    try std.testing.expectEqualSlices(u8, wanted.docinfo.bytes, result.docinfo.bytes);
    try std.testing.expectEqual(wanted.body.sections.len, result.body.sections.len);
    for (wanted.body.sections, result.body.sections) |before, after| try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(!result.complete_document);
}

test "document version draft older fixture coverage includes documents with no drawing IDs to allocate" {
    const a = std.testing.allocator;
    var total_sections: usize = 0;
    var total_styles: usize = 0;
    for ([_][]const u8{ "aligns", "borderfill", "charshape", "linespacing", "lists-bullet", "multicolumns-in-common-controls", "pagedefs", "tabdef", "table-caption", "table-position", "table" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        const before = try a.dupe(u8, input);
        defer a.free(before);
        var draft = codec.prepare(a, input, options) catch |err| {
            std.debug.print("document profile {s}: {s}\n", .{ name, @errorName(err) });
            return err;
        };
        defer draft.deinit(a);
        try std.testing.expect(!draft.complete_document);
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        try std.testing.expectEqual(@as(usize, source.section_count), draft.body.sections.len);
        try std.testing.expectEqual(draft.body.sections.len, (try @import("hwp5/docinfo/section_count.zig").locate(draft.docinfo.bytes, draft.docinfo.target_version)).value);
        var styles: usize = 0;
        for (draft.body.sections, 0..) |current, index| {
            const original = try source.decodeSection(a, index);
            defer a.free(original);
            var original_records = @import("hwp5/record.zig").Iterator.init(original, .{});
            var current_records = @import("hwp5/record.zig").Iterator.init(current, .{});
            var section_styles: usize = 0;
            while (try original_records.next()) |old| {
                const new = (try current_records.next()) orelse return error.MissingMigratedRecord;
                try std.testing.expectEqual(old.tag, new.tag);
                try std.testing.expectEqual(old.level, new.level);
                if (old.tag == 76) {
                    section_styles += 1;
                    try std.testing.expectEqual(old.payload.len + 22, new.payload.len);
                    try std.testing.expectEqualSlices(u8, old.payload, new.payload[0..old.payload.len]);
                } else try std.testing.expectEqualSlices(u8, old.raw, new.raw);
            }
            try std.testing.expect(try current_records.next() == null);
            if (section_styles == 0) try std.testing.expectEqualSlices(u8, original, current);
            styles += section_styles;
            total_sections += 1;
        }
        try std.testing.expectEqual(styles, draft.body.converted_styles);
        total_styles += styles;
        try std.testing.expectEqualSlices(u8, before, input);
    }
    try std.testing.expectEqual(@as(usize, 12), total_sections);
    try std.testing.expectEqual(@as(usize, 17), total_styles);
}

fn verify(draft: codec.Draft, expected_styles: usize) !void {
    try std.testing.expect(!draft.complete_document);
    try std.testing.expect(!draft.docinfo.complete_document);
    try std.testing.expect(!draft.body.complete_document);
    try std.testing.expectEqual(draft.docinfo.source_version.raw, draft.body.source_version.raw);
    try std.testing.expectEqual(draft.docinfo.target_version.raw, draft.body.target_version.raw);
    try std.testing.expectEqual(@as(usize, 1), draft.body.sections.len);
    try std.testing.expectEqual(draft.body.sections.len, (try @import("hwp5/docinfo/section_count.zig").locate(draft.docinfo.bytes, draft.docinfo.target_version)).value);
    try std.testing.expectEqual(expected_styles, draft.body.converted_styles);
    try std.testing.expectEqual(@as(usize, 6), draft.opaque_section_bytes);
    const resources = try @import("hwp5/docinfo/resources.zig").inspect(draft.docinfo.bytes, draft.docinfo.target_version, .{});
    try resources.validateKnownCounts();
    var tree = try @import("hwp5/edit/source_tree.zig").parse(std.testing.allocator, draft.body.sections[0], draft.body.target_version, .{});
    defer tree.deinit(std.testing.allocator);
    const shapes = try @import("hwp5/body/shape_validation.zig").inspectDetailed(tree, .{ .tail = .alpha_shadow_metadata }, resources.bin_data_count);
    try std.testing.expectEqual(expected_styles, shapes.styles.parsed);
    try std.testing.expectEqual(@as(usize, 0), shapes.styles.extra_bytes);
}

test "document version draft prepares actual matching DocInfo and all sections without changing file bytes" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "charshape", "aligns", "multicolumns-in-common-controls" }, [_]usize{ 0, 16, 1 }) |name, count| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        const before = try a.dupe(u8, input);
        defer a.free(before);
        var draft = try codec.prepare(a, input, options);
        defer draft.deinit(a);
        try verify(draft, count);
        try std.testing.expectEqualSlices(u8, before, input);
        var limited = options;
        limited.max_output_bytes = draft.docinfo.bytes.len + draft.body.sections[0].len - 1;
        try std.testing.expectError(error.LimitExceeded, codec.prepare(a, input, limited));
        limited = options;
        limited.max_decoded_bytes = 1;
        try std.testing.expectError(error.LimitExceeded, codec.prepare(a, input, limited));
    }
}

test "document version draft owns every buffer after input release and atomically rejects every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var expected = try codec.prepare(a, input, options);
    defer expected.deinit(a);
    try @import("testing/allocation_failures.zig").check(allocationDraftCase, .{ input, expected });
    var owned: codec.Draft = blk: {
        const temporary = try a.dupe(u8, input);
        defer a.free(temporary);
        break :blk try codec.prepare(a, temporary, options);
    };
    defer owned.deinit(a);
    try verify(owned, 16);
}

test "document version draft refuses already modern files without silently changing their profile" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    try std.testing.expectError(error.UnsupportedDrawingMigrationTarget, codec.prepare(a, input, options));
    try std.testing.expectEqualSlices(u8, before, input);
}

test "document version draft every allocation failure releases actual multiple sections and their DocInfo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/pagedefs.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var expected = try codec.prepare(a, input, options);
    defer expected.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), expected.body.sections.len);
    try @import("testing/allocation_failures.zig").check(allocationDraftCase, .{ input, expected });
    try std.testing.expectEqualSlices(u8, before, input);
}
