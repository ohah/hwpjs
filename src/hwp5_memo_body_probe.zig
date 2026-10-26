const std = @import("std");

test "memo cell continuation rejects missing identity foreign parent and invalid template" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 2);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var paragraph = document.sections[0].paragraphs[58];
    paragraph.header_template = try paragraph.originalNode();
    paragraph.source_node = null;
    paragraph.instance_id = 0xfffffffe;
    const validate = @import("hwp5/edit/plain_text_source.zig").validate;
    _ = try validate(a, raw, source.header.version(), paragraph, 65536);
    const valid = paragraph;
    paragraph.instance_id = 0;
    try std.testing.expectError(error.UnsupportedStructuralControl, validate(a, raw, source.header.version(), paragraph, 65536));
    paragraph = valid;
    paragraph.parent_node = null;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, raw, source.header.version(), paragraph, 65536));
    paragraph = valid;
    paragraph.header_template = std.math.maxInt(u32);
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, raw, source.header.version(), paragraph, 65536));
}

test "memo cell continuation keeps generated source protection and merge history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 2, .paragraph = 58, .at_unit = 1 } }));
    const flow = try session.paragraphFlow(a, 2);
    defer a.free(flow);
    try std.testing.expect(flow[59].generated);
    try std.testing.expectEqual(flow[58].list_node, flow[59].list_node);
    var protection = try session.textSourceProtection(a, 2);
    defer protection.deinit(a);
    try std.testing.expect(!protection.protected_paragraphs[59]);
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 2, .paragraph = 59, .start_unit = 0, .end_unit = 0, .utf8 = "계속" } }));
    try std.testing.expect(try history.apply(session, .{ .merge_paragraph = .{ .section = 2, .paragraph = 58 } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    for (0..3) |_| try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    for (0..3) |_| try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "memo cell retention edits original field-disjoint cell through history and reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const session = try Session.open(a, input);
    defer session.close();
    var before = try session.textSourceProtection(a, 2);
    defer before.deinit(a);
    try std.testing.expectEqual(.retained_memo, before.mode);
    try std.testing.expect(!before.protected_paragraphs[58]);
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{
        .section = 2,
        .paragraph = 58,
        .start_unit = 0,
        .end_unit = 1,
        .utf8 = "셀검증",
    } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    var after = try reopened.textSourceProtection(a, 2);
    defer after.deinit(a);
    try std.testing.expect(!after.protected_paragraphs[58]);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "memo marker retention rejects wrong owner missing pair duplicate group and invalid node" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/NewYear_s_Day.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("hwp5/edit/paragraph_owner.zig").inspectGroups(a, tree, source.header.version());
    defer groups.deinit(a);
    for (groups.items) |group| if (group.memo) |memo| {
        const validate = @import("hwp5/edit/paragraph_owned_list.zig").validateMemoMarker;
        try validate(tree, groups, group.parent_node, memo.node);
        try std.testing.expectError(error.SourceBindingMismatch, validate(tree, groups, tree.nodes.len, memo.node));
        try std.testing.expectError(error.SourceBindingMismatch, validate(tree, groups, group.parent_node, tree.nodes.len));
        try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, groups, group.parent_node, group.header_node));
        try std.testing.expectError(error.MissingMemoListHeader, validate(tree, .{ .items = &.{} }, group.parent_node, memo.node));
        var duplicate = [_]@import("hwp5/body/list_groups.zig").Group{ group, group };
        try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, .{ .items = &duplicate }, group.parent_node, memo.node));
        const parent = tree.nodes[memo.node].parent;
        tree.nodes[memo.node].parent = null;
        try std.testing.expectError(error.UnsupportedParagraphRecord, validate(tree, groups, group.parent_node, memo.node));
        tree.nodes[memo.node].parent = parent;
        return;
    };
    return error.MissingMemoListHeader;
}

test "actual memo-list owner materializes empty body text without discarding memo siblings" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/NewYear_s_Day.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    const before = try session.paragraphFlow(a, 0);
    defer a.free(before);
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 41, .start_unit = 0, .end_unit = 0, .utf8 = "본문" } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("hwp5/edit/style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const after = try reopened.paragraphFlow(a, 0);
    defer a.free(after);
    try std.testing.expectEqual(before.len, after.len);
    for (before, after) |old, current| {
        try std.testing.expectEqual(old.memo_index, current.memo_index);
        try std.testing.expectEqual(old.host, current.host);
    }
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "actual memo document permits a field-disjoint body paragraph without changing memo ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/english.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const spans = try @import("hwp5/edit/local_field_spans.zig").collectReadableBound(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(spans);
    var selected: ?usize = null;
    for (doc.sections[0].paragraphs, 0..) |p, index| {
        if (p.parent_node != null or p.tokens.len == 0) continue;
        var overlaps = false;
        for (spans) |span| overlaps = overlaps or index >= span.begin.paragraph and index <= span.end.paragraph;
        if (!overlaps) {
            selected = index;
            break;
        }
    }
    const target = selected orelse return error.MissingFieldDisjointBody;
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    const before = try session.copyText(a, 0, target);
    defer a.free(before);
    const before_flows = try session.paragraphFlow(a, 0);
    defer a.free(before_flows);
    var protection = try session.textSourceProtection(a, 0);
    defer protection.deinit(a);
    try std.testing.expectEqual(.retained_memo, protection.mode);
    try std.testing.expect(!protection.protected_paragraphs[target]);
    for (spans) |span| for (span.begin.paragraph..span.end.paragraph + 1) |paragraph| {
        if (doc.sections[0].paragraphs[paragraph].parent_node == null) try std.testing.expect(protection.protected_paragraphs[paragraph]);
    };
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = target, .start_unit = 0, .end_unit = 0, .utf8 = "본문검증" } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var reopened_source = try @import("hwp5/text_source.zig").Source.open(a, saved.bytes);
    defer reopened_source.deinit();
    const after_bytes = try reopened_source.decodeSection(a, 0);
    defer a.free(after_bytes);
    var old_records = @import("hwp5/record.zig").Iterator.init(bytes, .{});
    var new_records = @import("hwp5/record.zig").Iterator.init(after_bytes, .{});
    while (try old_records.next()) |old| {
        if (old.tag == 69) continue; // Edited paragraph LINE_SEG is invalidated.
        while (true) {
            const next = (try new_records.next()) orelse return error.MissingSavedRecord;
            if (next.tag == 69) continue;
            try std.testing.expectEqual(old.tag, next.tag);
            try std.testing.expectEqual(old.level, next.level);
            // All field envelopes, owned lists and memo declarations stay exact.
            if (old.tag == 71 or old.tag == 72 or old.tag == 93) try std.testing.expectEqualSlices(u8, old.payload, next.payload);
            break;
        }
    }
    while (try new_records.next()) |extra| try std.testing.expectEqual(@as(u10, 69), extra.tag);
    const reopened = try @import("hwp5/edit/style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const text = try reopened.copyText(a, 0, target);
    defer a.free(text);
    const prefix = std.unicode.utf8ToUtf16LeStringLiteral("본문검증");
    const prefix_bytes = std.mem.sliceAsBytes(prefix[0..prefix.len]);
    try std.testing.expect(std.mem.startsWith(u8, text, prefix_bytes));
    try std.testing.expectEqualSlices(u8, before, text[prefix_bytes.len..]);
    const after_flows = try reopened.paragraphFlow(a, 0);
    defer a.free(after_flows);
    try std.testing.expectEqual(before_flows.len, after_flows.len);
    for (before_flows, after_flows) |old, current| {
        try std.testing.expectEqual(old.paragraph, current.paragraph);
        try std.testing.expectEqual(old.host, current.host);
        try std.testing.expectEqual(old.top_level, current.top_level);
        try std.testing.expectEqual(old.memo_index, current.memo_index);
        try std.testing.expectEqual(old.memo_node == null, current.memo_node == null);
    }
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    // A field-bearing root paragraph remains blocked; failed input keeps redo.
    const protected_paragraph = spans[0].begin.paragraph;
    try std.testing.expectError(error.UnsupportedSectionControl, history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = protected_paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "금지" } }));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "memo body eligibility retains unknown-field refusal and frees every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/english.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("hwp5/version.zig").Version) !void {
            const nodes = try @import("hwp5/edit/memo_body_retention.zig").nodes(allocator, raw, version);
            defer allocator.free(nodes);
            try std.testing.expect(nodes.len > 0);
        }
    }.run, .{ bytes, source.header.version() });
    const bad = try a.dupe(u8, bytes);
    defer a.free(bad);
    var records = @import("hwp5/record.zig").Iterator.init(bad, .{});
    while (try records.next()) |record| {
        if (record.tag != 71) continue;
        const header = try @import("hwp5/body/control_header.zig").Header.parse(record.payload);
        if (!try @import("hwp5/edit/memo_source_retention.zig").field(header)) continue;
        const offset = @intFromPtr(record.payload.ptr) - @intFromPtr(bad.ptr);
        std.mem.writeInt(u32, bad[offset..][0..4], @import("hwp5/body/control_rules.zig").id("%usr"), .little);
        try std.testing.expectError(error.UnsupportedSectionControl, @import("hwp5/edit/memo_body_retention.zig").nodes(a, bad, source.header.version()));
        return;
    }
    return error.MissingMemoField;
}
