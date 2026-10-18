const std = @import("std");
const fields = @import("local_field_spans.zig");

test "field topology diagnostics keep source binding and nesting limits strict" {
    const a = std.testing.allocator;
    const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };
    const template = synthetic();
    var bytes: [33 * 46]u8 = undefined;
    for (0..33) |index| @memcpy(bytes[index * 46 ..][0..46], template[0..46]);
    var projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{&bytes});
    defer projection.deinit(a);
    try std.testing.expectError(error.LimitExceeded, fields.inspectReadableBound(a, &bytes, version, projection.sections[0]));
    projection.sections[0].paragraphs[0].source_node = std.math.maxInt(u32);
    try std.testing.expectError(error.SourceBindingMismatch, fields.inspectReadableBound(a, &bytes, version, projection.sections[0]));
}

fn synthetic() [184]u8 {
    var bytes = @as([184]u8, @splat(0));
    for (0..4) |paragraph| {
        const at = paragraph * 46;
        std.mem.writeInt(u32, bytes[at..][0..4], 66 | (22 << 20), .little);
        std.mem.writeInt(u32, bytes[at + 4 ..][0..4], 8, .little);
        std.mem.writeInt(u32, bytes[at + 26 ..][0..4], 67 | (1 << 10) | (16 << 20), .little);
        const code: u16 = if (paragraph == 0 or paragraph == 3) 3 else 4;
        std.mem.writeInt(u16, bytes[at + 30 ..][0..2], code, .little);
        std.mem.writeInt(u32, bytes[at + 32 ..][0..4], if (code == 3) 0x25636c6b else 0x00636c6b, .little);
        std.mem.writeInt(u16, bytes[at + 44 ..][0..2], code, .little);
    }
    return bytes;
}

fn diagnosticAllocationCase(a: std.mem.Allocator) !void {
    const bytes = synthetic();
    const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };
    var projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{&bytes});
    defer projection.deinit(a);
    var report = try fields.inspectReadableBound(a, &bytes, version, projection.sections[0]);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.spans.len);
    try std.testing.expectEqual(@as(usize, 2), report.unresolved.len);
    try std.testing.expectEqual(.orphan_end, report.unresolved[0].kind);
    try std.testing.expectEqual(fields.Position{ .paragraph = 2, .unit = 0 }, report.unresolved[0].position);
    try std.testing.expectEqual(@as(?usize, null), report.unresolved[0].ordinal);
    try std.testing.expectEqual(.unclosed_start, report.unresolved[1].kind);
    try std.testing.expectEqual(fields.Position{ .paragraph = 3, .unit = 8 }, report.unresolved[1].position);
    try std.testing.expectEqual(@as(?usize, null), report.unresolved[1].list_node);
}

test "field topology diagnostics retain orphan ends and release every partial allocation" {
    try @import("../../testing/allocation_failures.zig").check(diagnosticAllocationCase, .{});
}

test "field topology diagnostics do not forgive identity mismatches or unknown field starts" {
    const a = std.testing.allocator;
    const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };
    for (0..2) |mutation| {
        var bytes = synthetic();
        if (mutation == 0) bytes[46 + 32] ^= 1 else bytes[32] ^= 1;
        var projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{&bytes});
        defer projection.deinit(a);
        const expected = if (mutation == 0) error.FieldMarkerMismatch else error.UnsupportedSectionControl;
        try std.testing.expectError(expected, fields.inspectReadableBound(a, &bytes, version, projection.sections[0]));
    }
}

test "field topology diagnostics retain actual unclosed start without inventing closure" {
    const a = std.testing.allocator;
    const path = "reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp";
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var projection = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer projection.deinit(a);
    const section = projection.sections[0];
    var report = try fields.inspectReadableBound(a, decoded, source.header.version(), section);
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 28), report.spans.len);
    try std.testing.expectEqual(@as(usize, 1), report.unresolved.len);
    const item = report.unresolved[0];
    try std.testing.expectEqual(.unclosed_start, item.kind);
    try std.testing.expectEqual(fields.Position{ .paragraph = 52, .unit = 8 }, item.position);
    try std.testing.expectEqual(@as(u32, 0x25636c6b), item.marker_id);
    try std.testing.expectEqual(@as(?usize, 0), item.ordinal);
    try std.testing.expectEqual(@as(?usize, 236), item.list_node);
    try std.testing.expectError(error.UnsupportedCrossParagraphField, fields.collectReadableBound(a, decoded, source.header.version(), section));
}
