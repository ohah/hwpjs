const std = @import("std");

test "original cross reference spans protect all thirteen derived labels without opening source policy" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/pic-in-head-01.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 25), bindings.len);
    var count: usize = 0;
    for (bindings) |binding| {
        if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
        _ = try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command);
        const span = binding.span;
        try std.testing.expectEqual(span.begin.paragraph, span.end.paragraph);
        for (span.begin.unit..span.end.unit + 1) |unit| {
            try std.testing.expectError(error.ReadOnlyCrossReferenceResult, @import("field_result_protection.zig").validate(a, bytes, source.header.version(), doc.sections[0], bindings, .{ .section = 0, .paragraph = span.begin.paragraph, .start_unit = @intCast(unit), .end_unit = @intCast(unit), .utf8 = "검증" }));
        }
        const dirty = try @import("field_dirty_values.zig").prepare(a, bytes, source.header.version(), doc.sections[0], span.begin.paragraph, .{ .paragraph = span.begin.paragraph, .start = span.begin.unit, .end = span.end.unit });
        defer a.free(dirty);
        try std.testing.expect(@import("field_attributes.zig").find(dirty, binding.source_node) == null);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
    const outside: @import("plain_text.zig").Splice = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "검증" };
    try std.testing.expect(!(try @import("field_result_protection.zig").validate(a, bytes, source.header.version(), doc.sections[0], bindings, outside)));
    try std.testing.checkAllAllocationFailures(a, protectionAllocationCase, .{ bytes, source.header.version(), doc.sections[0], bindings, outside });
    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTransaction(a, bytes, source.header.version()));
    const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

fn protectionAllocationCase(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, section: @import("../../model/document.zig").Section, bindings: []const @import("field_bindings.zig").Binding, edit: @import("plain_text.zig").Splice) !void {
    try std.testing.expect(!(try @import("field_result_protection.zig").validate(a, bytes, version, section, bindings, edit)));
}

test "original roadmap cross reference source bindings cover all seven sections without claiming target resolution" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqual(@as(usize, 7), source.section_count);
    var total: usize = 0;
    var references: usize = 0;
    for (0..source.section_count) |section| {
        const bytes = try source.decodeSection(a, section);
        defer a.free(bytes);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer doc.deinit(a);
        const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
        defer a.free(bindings);
        total += bindings.len;
        for (bindings) |binding| {
            if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
            _ = try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command);
            references += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 21), total);
    try std.testing.expectEqual(@as(usize, 18), references);
}
