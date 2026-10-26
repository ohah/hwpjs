const std = @import("std");
const model = @import("model/document.zig");

test "restart provenance rejects aliases foreign cells and invalid identities and preserves failed transactions" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const preparation = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer preparation.close();
    try preparation.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 1, .at_unit = 1 } });
    const saved = try preparation.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var source = try @import("hwp5/text_source.zig").Source.open(a, saved.bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var before = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer before.deinit(a);
    const merge = @import("hwp5/edit/merge_session.zig").apply;
    const command: @import("hwp5/edit/merge_session.zig").Merge = .{ .section = 0, .paragraph = 1 };
    try std.testing.expectError(error.LimitExceeded, merge(a, &.{raw}, &document, source.header.version(), command, 65536, 8));
    try std.testing.expect(@import("model/equality.zig").document(before, document));
    for (0..16) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, merge(failure.allocator(), &.{raw}, &document, source.header.version(), command, 65536, 8_000_000));
        try std.testing.expect(@import("model/equality.zig").document(before, document));
    }
    try merge(a, &.{raw}, &document, source.header.version(), command, 65536, 8_000_000);
    const current = document.sections[0].paragraphs[1];
    try std.testing.expect(current.restart_control_source != null);
    var tree = try @import("hwp5/edit/source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(source.header.version(), tree.version.?);
    var links = try @import("hwp5/body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const link = (try @import("hwp5/edit/page_restart_source.zig").forParagraph(links.items, current)).?;
    var missing_version = tree;
    missing_version.version = null;
    try std.testing.expectError(error.MissingSourceVersion, @import("hwp5/edit/page_restart_current.zig").unit(a, missing_version, links.items, link, current));
    const resolve = @import("hwp5/edit/current_restart_anchor.zig").resolve;
    const aliases = try a.dupe(model.Paragraph, before.sections[0].paragraphs);
    defer a.free(aliases);
    aliases[1] = current; // Old source owner still exists: never duplicate it.
    try std.testing.expectError(error.SourceBindingMismatch, resolve(a, tree, links.items, link, aliases));
    var duplicate = current;
    duplicate.source_node = null;
    duplicate.header_template = current.source_node;
    duplicate.instance_id = 0xfffffffe;
    try std.testing.expectError(error.AmbiguousRestartSplit, resolve(a, tree, links.items, link, &.{ current, duplicate }));
    var groups = try @import("hwp5/edit/paragraph_owner.zig").inspectGroups(a, tree, source.header.version());
    defer groups.deinit(a);
    const owner = try @import("hwp5/edit/paragraph_owner.zig").logicalOwner(tree, groups, current.source_node.?);
    var checked: usize = 0;
    for (before.sections[0].paragraphs) |other| {
        if (other.parent_node != current.parent_node or try @import("hwp5/edit/paragraph_owner.zig").logicalOwner(tree, groups, other.source_node.?) == owner) continue;
        var foreign = current;
        foreign.source_node = other.source_node;
        foreign.instance_id = other.instance_id;
        try std.testing.expectError(error.ParagraphOwnerMismatch, @import("hwp5/edit/page_restart_current.zig").unit(a, tree, links.items, link, foreign));
        checked += 1;
    }
    try std.testing.expect(checked > 0);
    var invalid = current;
    invalid.restart_control_source = std.math.maxInt(u32);
    try std.testing.expectError(error.SourceBindingMismatch, @import("hwp5/edit/page_restart_source.zig").forParagraph(links.items, invalid));
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, p: model.Paragraph) !void {
            var cloned = try @import("model/clone.zig").paragraph(allocator, p);
            defer cloned.deinit(allocator);
            try std.testing.expectEqual(p.restart_control_source, cloned.restart_control_source);
            try std.testing.expect(@import("model/equality.zig").paragraph(p, cloned));
        }
    }.run, .{current});
}
