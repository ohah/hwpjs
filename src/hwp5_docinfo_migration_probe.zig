const std = @import("std");
const codec = @import("hwp5/edit/docinfo_migration_draft.zig");
const defaults: codec.Defaults = .{ .character = .{ .border_fill_id = 0, .inactive_strike_color = 0 } };

test "DocInfo migration draft auxiliary validation refuses unknown schemas and sweeps allocations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var selected = defaults;
    selected.auxiliary = .{ .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty }, .forbidden = .observed_lists };
    var expected = try codec.prepare(a, info, source.header.version(), source.header.version(), selected, 4_000_000);
    defer expected.deinit(a);
    try std.testing.expectEqualSlices(u8, info, expected.bytes);
    try std.testing.expectEqual(@as(usize, 2), expected.auxiliary_records);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, options: codec.Defaults) !void {
            var result = try codec.prepare(allocator, bytes, .{ .raw = 0x05000300 }, .{ .raw = 0x05000300 }, options, 4_000_000);
            defer result.deinit(allocator);
            try std.testing.expectEqualSlices(u8, bytes, result.bytes);
            try std.testing.expectEqual(@as(usize, 2), result.auxiliary_records);
        }
    }.run, .{ info, selected });
    var raw_policy = selected;
    raw_policy.auxiliary.?.forbidden = .preserve_raw;
    try std.testing.expectError(error.UnsupportedDocInfoAuxiliaryPayload, codec.prepare(a, info, source.header.version(), source.header.version(), raw_policy, 4_000_000));
    const changed = try a.dupe(u8, info);
    defer a.free(changed);
    var rows = @import("hwp5/record.zig").Iterator.init(info, .{});
    while (try rows.next()) |row| {
        const start = @intFromPtr(row.payload.ptr) - @intFromPtr(info.ptr);
        if (row.tag == 94) {
            std.mem.writeInt(u32, changed[start..][0..4], 0xffffffff, .little);
            try std.testing.expectError(error.UnexpectedEnd, codec.prepare(a, changed, source.header.version(), source.header.version(), selected, 4_000_000));
            @memcpy(changed, info);
        } else if (row.tag == 27) {
            std.mem.writeInt(u16, changed[start + 8 ..][0..2], 0x7fff, .little);
            try std.testing.expectError(error.UnsupportedDocInfoAuxiliaryPayload, codec.prepare(a, changed, source.header.version(), source.header.version(), selected, 4_000_000));
            @memcpy(changed, info);
        }
    }
    try std.testing.expectEqualSlices(u8, info, changed);
}

test "DocInfo migration draft surveys actual older fixture profiles" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "aligns.hwp", "borderfill.hwp", "charshape.hwp", "linespacing.hwp", "lists-bullet.hwp", "multicolumns-in-common-controls.hwp", "noori.hwp", "pagedefs.hwp", "tabdef.hwp", "table-caption.hwp", "table-position.hwp", "table.hwp" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        const info = try source.decodeDocInfo(a, 4_000_000);
        defer a.free(info);
        const original_info = try a.dupe(u8, info);
        defer a.free(original_info);
        if (std.mem.eql(u8, name, "noori.hwp")) {
            const refs = try @import("hwp5/docinfo/references.zig").inspect(info, source.header.version(), .{});
            try std.testing.expectEqual(@as(usize, 7), refs.deferred);
            try std.testing.expectEqual(@as(usize, 2), refs.unknown_records);
            var records = try @import("hwp5/docinfo/reader.zig").Iterator.init(info, source.header.version(), .{});
            var unknown: usize = 0;
            while (try records.next()) |row| if (row.value == .unknown) {
                try std.testing.expect(unknown < 2);
                try std.testing.expectEqual(([_]u10{ 27, 94 })[unknown], row.framing.tag);
                try std.testing.expectEqual(([_]usize{ 80, 16 })[unknown], row.framing.payload.len);
                unknown += 1;
            };
            try std.testing.expectEqual(@as(usize, 2), unknown);
            try std.testing.expectError(error.UnsupportedDocInfoMigrationRecord, codec.prepare(a, info, source.header.version(), .{ .raw = 0x05000300 }, defaults, 4_000_000));
            try std.testing.expectEqualSlices(u8, original_info, info);
        }
        var selected_defaults = defaults;
        if (std.mem.eql(u8, name, "noori.hwp")) selected_defaults.auxiliary = .{ .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty }, .forbidden = .observed_lists };
        var draft = try codec.prepare(a, info, source.header.version(), .{ .raw = 0x05000300 }, selected_defaults, 4_000_000);
        defer draft.deinit(a);
        try std.testing.expectEqual(@as(usize, if (std.mem.eql(u8, name, "noori.hwp")) 2 else 0), draft.auxiliary_records);
        const report = try @import("hwp5/docinfo/resources.zig").inspect(draft.bytes, draft.target_version, .{});
        try report.validateKnownCounts();
        const before = try @import("hwp5/docinfo/resources.zig").inspect(info, draft.source_version, .{});
        try std.testing.expectEqualDeep(before.counts, report.counts);
        var old_records = @import("hwp5/record.zig").Iterator.init(info, .{});
        var new_records = @import("hwp5/record.zig").Iterator.init(draft.bytes, .{});
        while (try old_records.next()) |old| {
            const new = (try new_records.next()) orelse return error.MissingMigratedRecord;
            try std.testing.expectEqual(old.tag, new.tag);
            try std.testing.expectEqual(old.level, new.level);
            if (old.tag != 17 and old.tag != 21 and old.tag != 25) try std.testing.expectEqualSlices(u8, old.raw, new.raw);
        }
        try std.testing.expect(try new_records.next() == null);
        try std.testing.expectEqualSlices(u8, original_info, info);
        try std.testing.expect(!draft.complete_document);
    }
}

test "DocInfo migration draft actual body retains paragraph and section version interpretation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const resources = try @import("hwp5/docinfo/resources.zig").inspect(info, source.header.version(), .{});
    try resources.validateKnownCounts();
    const target: @import("hwp5/version.zig").Version = .{ .raw = 0x05000300 };
    const body = @import("hwp5/body/reader.zig");
    var paragraphs: usize = 0;
    var definitions: usize = 0;
    var outline_uses: usize = 0;
    var unknown_records: usize = 0;
    var controls: usize = 0;
    var columns: usize = 0;
    var opaque_section_bytes: usize = 0;
    for (0..source.section_count) |section_index| {
        const bytes = try source.decodeSection(a, section_index);
        defer a.free(bytes);
        const before = try a.dupe(u8, bytes);
        defer a.free(before);
        var original = try body.Iterator.init(bytes, source.header.version(), .{});
        var migrated = try body.Iterator.init(bytes, target, .{});
        while (try original.next()) |record| {
            const current = (try migrated.next()) orelse return error.MissingBodyRecord;
            try std.testing.expectEqual(record.framing.tag, current.framing.tag);
            try std.testing.expectEqualDeep(record.value, current.value);
            if (record.value == .unknown) {
                unknown_records += 1;
            }
            if (record.value == .control_header) {
                controls += 1;
                const control = record.value.control_header;
                if (control.id == body.column_def.control_id) {
                    const column = try body.column_def.Definition.parse(control.properties);
                    try std.testing.expectEqual(@as(usize, 0), column.extra.len);
                    columns += 1;
                } else try std.testing.expectEqual(body.section_def.control_id, control.id);
            }
            if (record.value == .header) {
                paragraphs += 1;
                var shapes = try @import("hwp5/docinfo/reader.zig").Iterator.init(info, source.header.version(), .{});
                var ordinal: usize = 0;
                var found = false;
                while (try shapes.next()) |shape| if (shape.value == .para_shape) {
                    if (ordinal == record.value.header.para_shape_id) {
                        found = true;
                        const value = shape.value.para_shape;
                        if ((value.attributes >> 23) & 3 == 1 and value.head_id == 0) outline_uses += 1;
                    }
                    ordinal += 1;
                };
                try std.testing.expect(found);
            }
            if (record.value == .control_header and record.value.control_header.id == body.section_def.control_id) {
                const old = try body.section_def.Definition.parse(record.value.control_header.properties, source.header.version());
                const new = try body.section_def.Definition.parse(current.value.control_header.properties, target);
                try std.testing.expectEqualDeep(old, new);
                try std.testing.expect(old.numbering_id > 0);
                try std.testing.expect(old.numbering_id <= resources.count(.numbering));
                // Equality is not an interpretation of the retained six-byte tail.
                try std.testing.expect(old.observed_extension == null);
                opaque_section_bytes += old.extra.len;
                definitions += 1;
            }
        }
        try std.testing.expect(try migrated.next() == null);
        try std.testing.expectEqualSlices(u8, before, bytes);
    }
    try std.testing.expectEqual(@as(usize, 7), paragraphs);
    try std.testing.expectEqual(@as(usize, 1), definitions);
    try std.testing.expectEqual(@as(usize, 0), outline_uses);
    try std.testing.expectEqual(@as(usize, 0), unknown_records);
    try std.testing.expectEqual(@as(usize, 2), controls);
    try std.testing.expectEqual(@as(usize, 1), columns);
    try std.testing.expectEqual(@as(usize, 6), opaque_section_bytes);
}

test "DocInfo migration draft assembles every actual shape while retaining all other records and counts" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const before = try a.dupe(u8, info);
    defer a.free(before);
    const target: @import("hwp5/version.zig").Version = .{ .raw = 0x05000300 };
    var draft = try codec.prepare(a, info, source.header.version(), target, defaults, 4_000_000);
    defer draft.deinit(a);
    try std.testing.expect(!draft.complete_document);
    try std.testing.expectEqual(source.header.version().raw, draft.source_version.raw);
    try std.testing.expectEqual(target.raw, draft.target_version.raw);
    try std.testing.expectEqual(@as(usize, 19), draft.character_records);
    try std.testing.expectEqual(@as(usize, 12), draft.paragraph_records);
    try std.testing.expectEqual(@as(usize, 7), draft.body_outline_references);
    try std.testing.expectEqual(info.len + 210, draft.bytes.len);
    var original = @import("hwp5/record.zig").Iterator.init(info, .{});
    var current = @import("hwp5/record.zig").Iterator.init(draft.bytes, .{});
    var count: usize = 0;
    var legacy: usize = 0;
    while (try original.next()) |record| {
        const updated = (try current.next()) orelse return error.MissingMigratedRecord;
        try std.testing.expectEqual(record.tag, updated.tag);
        try std.testing.expectEqual(record.level, updated.level);
        if (record.tag == 21) {
            const Shape = @import("hwp5/docinfo/char_shape.zig").CharShape;
            const old = try Shape.parse(record.payload, source.header.version());
            const value = try Shape.parse(updated.payload, target);
            try std.testing.expectEqual(@as(usize, 74), updated.payload.len);
            try std.testing.expectEqualSlices(u8, record.payload[0..46], updated.payload[0..46]);
            try std.testing.expectEqualSlices(u8, record.payload[50..68], updated.payload[50..68]);
            if (@import("hwp5/edit/character_decoration_compat.zig").legacyStrike(old.underlineKindRaw(), old.strikeKindRaw())) {
                try std.testing.expectEqual(@as(u3, 1), value.strikeKindRaw());
                try std.testing.expectEqual(old.underline_color, value.strike_color.?);
                try std.testing.expectEqual(old.underlineStyleRaw(), value.strikeStyleRaw());
                legacy += 1;
            } else try std.testing.expectEqual(old.attributes, value.attributes);
        } else if (record.tag == 25) {
            try std.testing.expectEqual(@as(usize, 54), updated.payload.len);
            try std.testing.expectEqualSlices(u8, record.payload, updated.payload[0..46]);
            try std.testing.expectEqualSlices(u8, record.payload[24..28], updated.payload[50..54]);
        } else try std.testing.expectEqualSlices(u8, record.raw, updated.raw);
        count += 1;
    }
    try std.testing.expect(try current.next() == null);
    try std.testing.expectEqual(@as(usize, 69), count);
    try std.testing.expectEqual(@as(usize, 1), legacy);
    const references = try @import("hwp5/docinfo/references.zig").inspect(draft.bytes, target, .{});
    try references.validateKnown();
    try std.testing.expectEqual(@as(usize, 7), references.deferred);
    try std.testing.expectEqual(@as(usize, 0), references.unknown_records);
    try std.testing.expectEqualSlices(u8, before, info);
    try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
    try std.testing.expectError(error.LimitExceeded, codec.prepare(a, info, source.header.version(), target, defaults, 1));
    try std.testing.expectError(error.MissingCharacterMigrationDefault, codec.prepare(a, info, source.header.version(), target, .{}, 4_000_000));
    try std.testing.expectError(error.InvalidResourceReference, codec.prepare(a, info, source.header.version(), target, .{ .character = .{ .border_fill_id = 65535, .inactive_strike_color = 0 } }, 4_000_000));
    try std.testing.expectError(error.UnsupportedDocInfoTransitionTarget, codec.prepare(a, info, target, source.header.version(), defaults, 4_000_000));
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original_bytes: []const u8, expected: []const u8) !void {
            var value = try codec.prepare(allocator, original_bytes, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, defaults, 4_000_000);
            defer value.deinit(allocator);
            try std.testing.expectEqualSlices(u8, expected, value.bytes);
            try std.testing.expect(!value.complete_document);
        }
    }.run, .{ info, draft.bytes });
}
