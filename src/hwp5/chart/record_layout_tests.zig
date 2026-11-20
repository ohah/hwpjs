//! Prepared focused regressions. No external/reference fixtures or layout retry.
const std = @import("std");
const a = std.testing.allocator;
const ole = @import("../body/ole.zig");
const edit = @import("../edit/style_preservation.zig");
const Request = @import("create_request.zig").Request;
const data = @import("create_test_fixture.zig").data;
const png = @embedFile("test_fixtures/create-transport-bars-64.png");
fn payload(comptime layout: ole.Layout) [if (layout == .spec24) 24 else 26]u8 {
    const offset: usize = if (layout == .spec24) 2 else 4;
    var bytes: [if (layout == .spec24) 24 else 26]u8 = @splat(0);
    if (layout == .spec24) std.mem.writeInt(u16, bytes[0..2], 1 | (101 << 9), .little) else std.mem.writeInt(u32, bytes[0..4], 1 | (101 << 9) | (3 << 16), .little);
    std.mem.writeInt(i32, bytes[offset..][0..4], -2147483648, .little);
    std.mem.writeInt(i32, bytes[offset + 4 ..][0..4], 2147483647, .little);
    std.mem.writeInt(u16, bytes[offset + 8 ..][0..2], 1, .little);
    std.mem.writeInt(u32, bytes[offset + 10 ..][0..4], 0x12345678, .little);
    std.mem.writeInt(i32, bytes[offset + 14 ..][0..4], -1, .little);
    std.mem.writeInt(u32, bytes[offset + 18 ..][0..4], 0xffffffff, .little);
    return bytes;
}
test "H5 chart record layout known spec24 and observed26 prove fields without reinterpreting signed or border values" {
    inline for (.{ ole.Layout.spec24, ole.Layout.observed26 }) |layout| {
        const raw = payload(layout);
        const actual = try ole.Properties.parseKnown(&raw);
        try std.testing.expectEqual(layout, actual.layout);
        try std.testing.expectEqual(@as(i32, -2147483648), actual.extent_x);
        try std.testing.expectEqual(@as(i32, 2147483647), actual.extent_y);
        try std.testing.expectEqual(@as(u16, 1), actual.bin_data_id);
        try std.testing.expectEqual(@as(u32, 0x12345678), actual.border_color);
        try std.testing.expectEqual(@as(i32, -1), actual.border_thickness);
        try std.testing.expectEqual(@as(u32, 0xffffffff), actual.border_attributes);
        try std.testing.expectEqual(@as(u7, 101), actual.baselineRaw());
        try std.testing.expectEqual(@as(usize, 0), actual.extra.len);
        if (layout == .spec24) try std.testing.expectEqual(@as(?u6, null), actual.objectKind()) else try std.testing.expectEqual(@as(?u6, 3), actual.objectKind());
    }
}
test "H5 chart record layout truncated records stay refused and legacy opaque tails and raw attributes retain parity" {
    const original = payload(.observed26);
    for (0..24) |length| try std.testing.expectError(error.UnexpectedEnd, ole.Properties.parseKnown(original[0..length]));
    try std.testing.expectError(error.UnexpectedEnd, ole.Properties.parseKnown(original[0..25]));
    inline for (.{ 26, 27, 30, 47 }) |length| {
        var raw: [length]u8 = @splat(0xa5);
        @memcpy(raw[0..26], &original);
        // Raw enum/reserved values are diagnostics, not a new admission veto.
        for ([_]u32{ 0, 3, 1 | (102 << 9), 1 | (5 << 16), 1 | (1 << 22), 0xffffffff }) |attributes| {
            std.mem.writeInt(u32, raw[0..4], attributes, .little);
            const selected = try ole.Properties.parseKnown(&raw);
            const prior = try ole.Properties.parse(&raw, .observed26);
            try std.testing.expectEqualDeep(prior, selected);
            try std.testing.expectEqualSlices(u8, raw[26..], selected.extra);
            try std.testing.expectEqual(raw[26..].ptr, selected.extra.ptr);
        }
    }
}
fn request(a0: std.mem.Allocator, session: *edit.Session) !struct { value: Request, text: []u8 } {
    const reference = try session.currentSourceParagraphReference(0, 0);
    const text = try session.copyCurrentParagraphTextUtf16(a0, 0, reference);
    errdefer a0.free(text);
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a0, data);
    defer a0.free(xml);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    return .{ .text = text, .value = .{
        .target = .{ .section = 0, .anchor = .{ .host = reference.source.host, .unit = 16 }, .binding = try session.historyTicket() },
        .expected_text_utf16le = text,
        .box = .{ .width = 12000, .height = 12000 },
        .data = data,
        .rendered = .{ .source_xml_sha256 = digest, .pixel_width = 64, .pixel_height = 64, .bytes = png },
        .profile = .spec24_registered_png_presentation_v1,
    } };
}
fn created(a0: std.mem.Allocator, count: usize) ![]u8 {
    const input = try @import("../../new_document/hwp5.zig").create(a0);
    defer a0.free(input);
    const session = try edit.Session.open(a0, input);
    defer session.close();
    session.enableHistoryDelta();
    for (0..count) |_| {
        const req = try request(a0, session);
        defer a0.free(req.text);
        try session.apply(.{ .insert_chart = req.value });
    }
    return (try session.save(a0, .{ .allow_stale_layout = true })).bytes;
}
const Mutation = enum { observed26_first, truncate_first, opaque_first, legacy30_first, legacy_raw_first, legacy_opaque_zero_first, zero_first, out_of_range_first };
fn changed(a0: std.mem.Allocator, input: []const u8, mutation: Mutation) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a0, input);
    defer source.deinit();
    const raw = try source.decodeSection(a0, 0);
    defer a0.free(raw);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a0);
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var found = false;
    while (try it.next()) |record| {
        if (record.tag != 84 or found) {
            try out.appendSlice(a0, record.raw);
            continue;
        }
        found = true;
        if (record.payload.len != 24) return error.TestExpectedSpec24;
        var converted: [30]u8 = @splat(0);
        std.mem.writeInt(u32, converted[0..4], 1 | (3 << 16), .little);
        @memcpy(converted[4..26], record.payload[2..24]);
        switch (mutation) {
            .observed26_first => try @import("../record_writer.zig").append(a0, &out, 84, record.level, converted[0..26], 1048576),
            .truncate_first => try @import("../record_writer.zig").append(a0, &out, 84, record.level, converted[0..25], 1048576),
            .opaque_first => {
                converted[26] = 0xa5;
                try @import("../record_writer.zig").append(a0, &out, 84, record.level, converted[0..27], 1048576);
            },
            .legacy30_first, .legacy_raw_first => {
                if (mutation == .legacy_raw_first) std.mem.writeInt(u32, converted[0..4], 0xffffffff, .little);
                try @import("../record_writer.zig").append(a0, &out, 84, record.level, &converted, 1048576);
            },
            .legacy_opaque_zero_first => {
                std.mem.writeInt(u16, converted[12..14], 0, .little);
                // Opaque bytes imitate a valid ordinal; they are never binding input.
                std.mem.writeInt(u32, converted[26..30], 1, .little);
                try @import("../record_writer.zig").append(a0, &out, 84, record.level, &converted, 1048576);
            },
            .zero_first, .out_of_range_first => {
                var p = record.payload[0..24].*;
                std.mem.writeInt(u16, p[10..12], if (mutation == .zero_first) 0 else 65535, .little);
                try @import("../record_writer.zig").append(a0, &out, 84, record.level, &p, 1048576);
            },
        }
    }
    if (!found) return error.MissingOle;
    return @import("../../cfb/stream_replace.zig").rebuildExact(a0, &source.file, "/BodyText/Section0", out.items, .{});
}
fn queryAndPreserve(input: []const u8, expect_count: usize) !void {
    const session = try edit.Session.open(a, input);
    defer session.close();
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(expect_count, rows.len);
    for (rows) |row| {
        try std.testing.expectEqual(@import("candidate_snapshot.zig").State.modern_chart, row.resource.state);
        var display = try session.hwp5ChartDisplay(a, row.section, row.owner.control_node);
        defer display.deinit(a);
        try std.testing.expectEqual(row.owner.ole_layout, display.owner.ole_layout);
        try std.testing.expectEqual(@as(usize, 1), display.presentation_streams);
    }
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}
test "H5 chart record layout default candidates and display read spec24 and strict observed26 with whole saved bytes unchanged" {
    const spec = try created(a, 1);
    defer a.free(spec);
    try queryAndPreserve(spec, 1);
    const observed = try changed(a, spec, .observed26_first);
    defer a.free(observed);
    try queryAndPreserve(observed, 1);
}
test "H5 chart record layout mixed valid24 and26 owners use independent layouts with preserved file bytes" {
    const input = try created(a, 2);
    defer a.free(input);
    const mixed = try changed(a, input, .observed26_first);
    defer a.free(mixed);
    try queryAndPreserve(mixed, 2);
    const session = try edit.Session.open(a, mixed);
    defer session.close();
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    var n24: usize = 0;
    var n26: usize = 0;
    for (rows) |row| {
        if (row.owner.ole_layout == .spec24) n24 += 1 else n26 += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), n24);
    try std.testing.expectEqual(@as(usize, 1), n26);
}
test "H5 chart record layout truncated owner stays refused without global fallback" {
    const input = try created(a, 2);
    defer a.free(input);
    const bad = try changed(a, input, .truncate_first);
    defer a.free(bad);
    const session = try edit.Session.open(a, bad);
    defer session.close();
    try std.testing.expectError(error.UnexpectedEnd, session.hwp5ChartCandidates(a));
    const explicit = try session.hwp5ChartCandidatesWithLayout(a, .spec24);
    defer a.free(explicit);
    try std.testing.expectEqual(@as(usize, 2), explicit.len);
    try std.testing.expectError(error.UnexpectedEnd, session.hwp5ChartDisplay(a, explicit[1].section, explicit[1].owner.control_node));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bad, saved.bytes);
}
test "H5 chart record layout unrelated legacy30 raw attributes or opaque tail never blocks selecting another valid owner" {
    const input = try created(a, 2);
    defer a.free(input);
    inline for (.{ Mutation.legacy30_first, Mutation.legacy_raw_first, Mutation.opaque_first }) |mutation| {
        const mixed = try changed(a, input, mutation);
        defer a.free(mixed);
        try queryAndPreserve(mixed, 2);
        const session = try edit.Session.open(a, mixed);
        defer session.close();
        const rows = try session.hwp5ChartCandidates(a);
        defer a.free(rows);
        try std.testing.expectEqual(ole.Layout.observed26, rows[0].owner.ole_layout);
        try std.testing.expectEqual(@as(usize, if (mutation == .opaque_first) 1 else 4), rows[0].owner.opaque_tail_bytes);
        try std.testing.expectEqual(ole.Layout.spec24, rows[1].owner.ole_layout);
        if (mutation == .legacy_raw_first) try std.testing.expectEqual(@as(u32, 0xffffffff), rows[0].owner.attributes);
    }
}
test "H5 chart record layout recognition never turns absent or out of range BinData into admitted chart ownership" {
    const input = try created(a, 2);
    defer a.free(input);
    inline for (.{ Mutation.zero_first, Mutation.out_of_range_first }) |mutation| {
        const bad = try changed(a, input, mutation);
        defer a.free(bad);
        const session = try edit.Session.open(a, bad);
        defer session.close();
        const rows = try session.hwp5ChartCandidates(a);
        defer a.free(rows);
        try std.testing.expectEqual(@as(usize, 2), rows.len);
        try std.testing.expectEqual(@import("candidate_snapshot.zig").State.unavailable, rows[0].resource.state);
        try std.testing.expectEqual(@import("candidate_snapshot.zig").State.modern_chart, rows[1].resource.state);
        try std.testing.expectError(if (mutation == .zero_first) error.InvalidOleBinaryReference else error.InvalidBinaryResourceOrdinal, session.hwp5ChartDisplay(a, rows[0].section, rows[0].owner.control_node));
    }
}

test "H5 chart record layout opaque legacy tail cannot supply an absent ordinal or rescue selected ownership" {
    const input = try created(a, 2);
    defer a.free(input);
    const bad = try changed(a, input, .legacy_opaque_zero_first);
    defer a.free(bad);
    const session = try edit.Session.open(a, bad);
    defer session.close();
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqual(@as(u16, 0), rows[0].owner.ordinal);
    try std.testing.expectEqual(@as(usize, 4), rows[0].owner.opaque_tail_bytes);
    try std.testing.expectEqual(@import("candidate_snapshot.zig").State.unavailable, rows[0].resource.state);
    try std.testing.expectError(error.InvalidOleBinaryReference, session.hwp5ChartDisplay(a, rows[0].section, rows[0].owner.control_node));
    var display = try session.hwp5ChartDisplay(a, rows[1].section, rows[1].owner.control_node);
    defer display.deinit(a);
    try std.testing.expect(rows[1].owner.ordinal != 0);
    try std.testing.expectEqual(rows[1].owner.ordinal, display.owner.ordinal);
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bad, saved.bytes);
}
