const std = @import("std");
const t = std.testing;
const attributes = @import("note_shape_attributes.zig");
const Shape = @import("note_shape.zig").Shape;

test "HWP5 note attributes distinguish footnote and endnote placement" {
    const foot = [_]attributes.FootnotePlacement{ .each_column, .across_columns, .rightmost_column };
    for (foot, 0..) |expected, raw| {
        const result = try attributes.decode(@as(u32, @intCast(raw)) << 8, .footnote);
        try t.expectEqual(expected, result.placement.footnote);
    }
    const end = [_]attributes.EndnotePlacement{ .document_end, .section_end };
    for (end, 0..) |expected, raw| {
        const result = try attributes.decode(@as(u32, @intCast(raw)) << 8, .endnote);
        try t.expectEqual(expected, result.placement.endnote);
    }
    try t.expectError(error.UnsupportedNotePlacement, attributes.decode(3 << 8, .footnote));
    try t.expectError(error.UnsupportedNotePlacement, attributes.decode(2 << 8, .endnote));
    try t.expectError(error.UnsupportedNotePlacement, attributes.decode(3 << 8, .endnote));
}

test "HWP5 note attributes page restart applies only to footnotes" {
    for ([_]attributes.Kind{ .footnote, .endnote }) |kind| {
        try t.expectEqual(attributes.Numbering.continue_previous, (try attributes.decode(0, kind)).numbering);
        try t.expectEqual(attributes.Numbering.restart_section, (try attributes.decode(1 << 10, kind)).numbering);
        try t.expectError(error.UnsupportedNoteNumbering, attributes.decode(3 << 10, kind));
    }
    try t.expectEqual(attributes.Numbering.restart_page, (try attributes.decode(2 << 10, .footnote)).numbering);
    try t.expectError(error.UnsupportedNoteNumbering, attributes.decode(2 << 10, .endnote));
}

test "HWP5 note superscript is absent for endnotes and raw bit remains uninterpreted" {
    const off = try attributes.decode(0, .footnote);
    const on = try attributes.decode(1 << 12, .footnote);
    try t.expectEqual(false, off.number_superscript.?);
    try t.expectEqual(true, on.number_superscript.?);
    const end = try attributes.decode(1 << 12, .endnote);
    try t.expectEqual(@as(?bool, null), end.number_superscript);
    try t.expectEqual(@as(u32, 1 << 12), end.uninterpreted_flags);
}

test "HWP5 note attributes preserve every raw number octet and high flag bit" {
    for (0..256) |raw| {
        const flags: u32 = 0xffffc000 | @as(u32, @intCast(raw)) | (1 << 13);
        for ([_]attributes.Kind{ .footnote, .endnote }) |kind| {
            const result = try attributes.decode(flags, kind);
            try t.expectEqual(@as(u8, @intCast(raw)), result.number_kind_raw);
            try t.expectEqual(@as(u32, 0xffffc000), result.uninterpreted_flags);
            try t.expect(result.beneath_text);
        }
    }
}

test "HWP5 note semantic refusal leaves both explicit layouts and borrowed raw intact" {
    for ([_]@import("note_shape.zig").Layout{ .observed28, .spec26 }) |layout| {
        const wire: [31]u8 = @splat(0xff);
        const original = wire;
        const shape = try Shape.parseLayout(&wire, layout);
        try t.expectEqual(@as(u8, 255), shape.numberKind());
        try t.expectEqual(@as(u2, 3), shape.placement());
        try t.expectEqual(@as(u2, 3), shape.numbering());
        try t.expectError(error.UnsupportedNotePlacement, shape.attributeSemantics(.footnote));
        try t.expectError(error.UnsupportedNotePlacement, shape.attributeSemantics(.endnote));
        try t.expectEqual(@as(u32, 0xffffffff), shape.flags);
        try t.expectEqualSlices(u8, &original, &wire);
        try t.expectEqualSlices(u8, wire[if (layout == .observed28) @as(usize, 28) else 26..], shape.extra);
    }
}

test "HWP5 note Shape delegates semantic view without normalizing raw fields" {
    var wire: [28]u8 = @splat(0);
    const flags: u32 = 0x80000000 | (1 << 8) | (1 << 10) | (1 << 12) | (1 << 13) | 0x81;
    std.mem.writeInt(u32, wire[0..4], flags, .little);
    const original = wire;
    const shape = try Shape.parse(&wire);
    const result = try shape.attributeSemantics(.footnote);
    try t.expectEqual(@as(u8, 0x81), result.number_kind_raw);
    try t.expectEqual(attributes.FootnotePlacement.across_columns, result.placement.footnote);
    try t.expectEqual(attributes.Numbering.restart_section, result.numbering);
    try t.expect(result.number_superscript.?);
    try t.expect(result.beneath_text);
    try t.expectEqual(@as(u32, 0x80000000), result.uninterpreted_flags);
    try t.expectEqualSlices(u8, &original, &wire);
}
