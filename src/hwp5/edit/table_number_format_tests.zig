const std = @import("std");
const framing = @import("../record.zig");

fn nextRetained(it: *framing.Iterator) !?framing.Record {
    while (try it.next()) |record| {
        if (record.tag == 66 or record.tag == 68 or record.tag == 69) continue;
        return record;
    }
    return null;
}

fn verify(path: []const u8, distribution: bool) !void {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64000000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var original = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer original.deinit();
    const opened = if (distribution) try @import("normalized_open.zig").openDistribution(a, input) else try @import("normalized_open.zig").open(a, input);
    const session = opened.session;
    defer session.close();
    var changed = false;
    for (0..original.section_count) |section| {
        for (0..try session.paragraphCount(section)) |paragraph| {
            const text = try session.copyText(a, section, paragraph);
            defer a.free(text);
            if (text.len < 4) continue;
            const first = std.mem.readInt(u16, text[0..2], .little);
            if (first < 32 or first >= 0xd800) continue;
            const ranges = try session.characterRanges(a, section, paragraph);
            defer a.free(ranges);
            const shapes = try session.characterShapes(a);
            defer a.free(shapes);
            const id = ranges[0].char_shape_id orelse return error.MissingCharacterShape;
            const expected = !shapes[id].bold;
            try session.apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = expected } } });
            const current_ranges = try session.characterRanges(a, section, paragraph);
            defer a.free(current_ranges);
            const current_shapes = try session.characterShapes(a);
            defer a.free(current_shapes);
            try std.testing.expectEqual(expected, current_shapes[current_ranges[0].char_shape_id.?].bold);
            const current_text = try session.copyText(a, section, paragraph);
            defer a.free(current_text);
            try std.testing.expectEqualSlices(u8, text, current_text);
            changed = true;
            break;
        }
        if (changed) break;
    }
    try std.testing.expect(changed);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var reopened = try @import("../text_source.zig").Source.openReadOnly(a, saved.bytes);
    defer reopened.deinit();
    try std.testing.expectEqual(original.section_count, reopened.section_count);
    for (0..original.section_count) |section| {
        const before = try original.decodeSection(a, section);
        defer a.free(before);
        const after = try reopened.decodeSection(a, section);
        defer a.free(after);
        var left = framing.Iterator.init(before, .{});
        var right = framing.Iterator.init(after, .{});
        while (try nextRetained(&left)) |record| {
            const actual = (try nextRetained(&right)) orelse return error.MissingRetainedRecord;
            try std.testing.expectEqualSlices(u8, record.raw, actual.raw);
        }
        try std.testing.expect((try nextRetained(&right)) == null);
        // Generic field transactions still require supported materialization;
        // only the text-splice entry may retain protected table-number labels.
        if (try @import("source_policy.zig").hasNamedFields(before)) try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTransaction(a, before, original.header.version()));
    }
}

test "table number character format retains original spec text and control declarations" {
    try verify("reference/rhwp/samples/hwpspec.hwp", true);
}

test "table number character format retains original distribution text and control declarations" {
    try verify("reference/rhwp/samples/hwp-3.0-HWPML.hwp", true);
}

test "table number character format source validation cleans every partial allocation" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpspec.hwp", a, .limited(64000000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    var small: std.ArrayList(u8) = .empty;
    defer small.deinit(a);
    for (0..source.section_count) |section| {
        const bytes = try source.decodeSection(a, section);
        defer a.free(bytes);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer doc.deinit(a);
        const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
        defer a.free(bound);
        const selected: ?usize = for (bound) |binding| {
            if (binding.span.field_id == @import("../body/control_rules.zig").id("%xrf")) break binding.span.begin.paragraph;
        } else null;
        const paragraph = selected orelse continue;
        var tree = try @import("../body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        const node = try doc.sections[0].paragraphs[paragraph].originalNode();
        const level = tree.nodes[node].record.framing.level;
        for (tree.nodes[node..tree.nodes[node].subtree_end]) |entry| {
            const record = entry.record.framing;
            try @import("../record_writer.zig").append(a, &small, record.tag, record.level - level, record.payload, 1024 * 1024);
        }
        break;
    }
    try std.testing.expect(small.items.len > 0);
    // An orphan target is retained for formatting and protected text splices.
    // Generic field transactions do not gain result materialization permission.
    try @import("../../testing/allocation_failures.zig").check(@import("source_policy.zig").validateCharacterFormat, .{ @as([]const u8, small.items), source.header.version() });
    // An untouched section may retain this exact local table-number label.
    // This permission does not extend to editing the field-bearing section.
    try @import("../../testing/allocation_failures.zig").check(@import("source_policy.zig").validateUnselectedTextSection, .{ @as([]const u8, small.items), source.header.version() });
    try @import("../../testing/allocation_failures.zig").check(@import("source_policy.zig").validateFieldTextTransaction, .{ @as([]const u8, small.items), source.header.version() });
    try @import("../../testing/allocation_failures.zig").check(retainedFieldTextAllocationCase, .{ @as([]const u8, small.items), source.header.version() });
    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateUnselectedSection(a, small.items, source.header.version()));
    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTransaction(a, small.items, source.header.version()));
    // Same-length command mutation: page references must not inherit the new
    // character-only table-number permission merely because topology is valid.
    var records = framing.Iterator.init(small.items, .{});
    while (try records.next()) |record| {
        if (record.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(record.payload);
        if (header.id != @import("../body/control_rules.zig").id("%xrf")) continue;
        const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
        const offset = @intFromPtr(properties.command.ptr) - @intFromPtr(small.items.ptr);
        var separators: usize = 0;
        var unit: usize = 0;
        while (unit < properties.command.len) : (unit += 2) {
            if (std.mem.readInt(u16, properties.command[unit..][0..2], .little) != ';') continue;
            separators += 1;
            if (separators == 1) {
                // Same-size orphan derivatives retain picture/equation number
                // labels without pretending to resolve or recompute a target.
                try std.testing.expectEqual(@as(u16, '0'), std.mem.readInt(u16, properties.command[unit + 2 ..][0..2], .little));
                for ([_]u16{ '1', '2' }) |kind| {
                    std.mem.writeInt(u16, small.items[offset + unit + 2 ..][0..2], kind, .little);
                    try @import("../../testing/allocation_failures.zig").check(retainedFieldTextAllocationCase, .{ @as([]const u8, small.items), source.header.version() });
                    try @import("../../testing/allocation_failures.zig").check(@import("source_policy.zig").validateUnselectedTextSection, .{ @as([]const u8, small.items), source.header.version() });
                    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTransaction(a, small.items, source.header.version()));
                }
                std.mem.writeInt(u16, small.items[offset + unit + 2 ..][0..2], '0', .little);
            }
            if (separators != 2) continue;
            try std.testing.expectEqual(@as(u16, '1'), std.mem.readInt(u16, properties.command[unit + 2 ..][0..2], .little));
            std.mem.writeInt(u16, small.items[offset + unit + 2 ..][0..2], '0', .little);
            try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateCharacterFormat(a, small.items, source.header.version()));
            try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateUnselectedTextSection(a, small.items, source.header.version()));
            try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTextTransaction(a, small.items, source.header.version()));
            return;
        }
    }
    return error.MissingReferenceMutation;
}

fn retainedFieldTextAllocationCase(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer doc.deinit(a);
    const plain = @import("plain_text.zig");
    const before = try plain.textBytes(a, doc.sections[0].paragraphs[0]);
    defer a.free(before);
    try @import("field_splice.zig").apply(a, source, version, &doc.sections[0], .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "Z" }, 65536);
    const after = try plain.textBytes(a, doc.sections[0].paragraphs[0]);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, before.len + 2), after.len);
    try std.testing.expectEqualSlices(u8, &.{ 'Z', 0 }, after[0..2]);
    try std.testing.expectEqualSlices(u8, before, after[2..]);
    const saved = try @import("text_section_writer.zig").write(a, source, doc.sections[0], version, 1024 * 1024);
    defer a.free(saved);
    var reopened = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{saved});
    defer reopened.deinit(a);
    const restored = try plain.textBytes(a, reopened.sections[0].paragraphs[0]);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, after, restored);
}
