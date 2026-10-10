const std = @import("std");
const Version = @import("../version.zig").Version;
const Site = @import("../body/cross_reference_name_target.zig").Site;

test "cross reference name transaction every allocation failure preserves changed label and saved section" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpctl_ParameterSetID_Item_v1.2.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const sites = try @import("cross_reference_bookmark_sites.zig").collect(a, bytes, source.header.version(), 0);
    defer a.free(sites);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bindings);
    const selected = for (bindings) |binding| {
        if (binding.span.field_id == @import("../body/control_rules.zig").id("%xrf")) break binding;
    } else return error.TestExpectedEqual;
    try std.testing.expectEqual(@import("../body/control_rules.zig").id("%xrf"), selected.span.field_id);
    const view = try @import("../body/cross_reference_command.zig").View.parse(selected.properties.command);
    const site = (try @import("../body/cross_reference_name_target.zig").resolveCommand(view, sites)).?;
    var tree = try @import("../body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const paragraph = try doc.sections[0].paragraphs[selected.span.begin.paragraph].originalNode();
    const level = tree.nodes[paragraph].record.framing.level;
    var small: std.ArrayList(u8) = .empty;
    defer small.deinit(a);
    // Explicit derivative: one original paragraph, normalized to root level.
    for (tree.nodes[paragraph..tree.nodes[paragraph].subtree_end]) |node| {
        const record = node.record.framing;
        try @import("../record_writer.zig").append(a, &small, record.tag, record.level - level, record.payload, 1024 * 1024);
    }
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ small.items, source.header.version(), site, @as(usize, 1) });
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ small.items, source.header.version(), site, @as(usize, 16) });
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8, version: Version, site: Site, cached_units: usize) !void {
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{bytes});
    defer doc.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, bytes, version, doc.sections[0]);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 1), bindings.len);
    const span = bindings[0].span;
    const p = &doc.sections[0].paragraphs[0];
    const original = try @import("plain_text_content.zig").textBytes(a, p.*);
    defer a.free(original);
    const cached = try a.alloc(u8, cached_units * 2);
    defer a.free(cached);
    for (0..cached_units) |unit| std.mem.writeInt(u16, cached[unit * 2 ..][0..2], 'X', .little);
    const changed_display = try @import("field_display_bytes.zig").prepare(a, original, span.begin.unit, span.end.unit, cached);
    defer a.free(changed_display);
    try @import("derived_display_apply.zig").applyDraft(a, p, original, changed_display, .{ .start_unit = span.begin.unit, .end_unit = span.end.unit, .added_units = @intCast(cached_units) }, null, 65536);
    const stable = std.testing.allocator;
    const before = try @import("plain_text_content.zig").textBytes(stable, p.*);
    defer stable.free(before);
    const saved_before = try @import("text_section_writer.zig").write(stable, bytes, doc.sections[0], version, 1024 * 1024);
    defer stable.free(saved_before);
    const report = @import("cross_reference_name_apply.zig").apply(a, bytes, version, &doc.sections[0], &.{site}, 65536) catch |err| {
        const current = try @import("plain_text_content.zig").textBytes(stable, doc.sections[0].paragraphs[0]);
        defer stable.free(current);
        try std.testing.expectEqualSlices(u8, before, current);
        const saved = try @import("text_section_writer.zig").write(stable, bytes, doc.sections[0], version, 1024 * 1024);
        defer stable.free(saved);
        try std.testing.expectEqualSlices(u8, saved_before, saved);
        return err;
    };
    try std.testing.expectEqual(@as(usize, 1), report.processed);
    try std.testing.expectEqual(@as(usize, 1), report.changed);
    const after = try @import("plain_text_content.zig").textBytes(stable, doc.sections[0].paragraphs[0]);
    defer stable.free(after);
    try std.testing.expectEqualSlices(u8, original, after);
    const saved = try @import("text_section_writer.zig").write(stable, bytes, doc.sections[0], version, 1024 * 1024);
    defer stable.free(saved);
    var reopened = try @import("../model_projection.zig").fromDecodedSections(stable, version, &.{saved});
    defer reopened.deinit(stable);
    const recovered = try @import("plain_text_content.zig").textBytes(stable, reopened.sections[0].paragraphs[0]);
    defer stable.free(recovered);
    try std.testing.expectEqualSlices(u8, original, recovered);
}
