const std = @import("std");
const planner = @import("hwp5/edit/page_restart_split_plan.zig");

comptime {
    _ = @import("hwp5/edit/column_split_draft.zig");
    _ = @import("hwp5_restart_provenance_probe.zig");
}

test "page restart split reopened originals merge retain control provenance and remain editable" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    for ([_]u32{ 0, 1, 9, 17 }) |at| {
        const first = try Session.open(a, input);
        defer first.close();
        const text = try first.copyText(a, 1, 1);
        defer a.free(text);
        try first.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 1, .at_unit = at } });
        const divided = try first.save(a, .{ .allow_stale_layout = true });
        defer a.free(divided.bytes);
        const session = try Session.open(a, divided.bytes);
        defer session.close();
        const before = try session.pageControlSources(a, 1);
        defer a.free(before);
        try session.apply(.{ .merge_paragraph = .{ .section = 1, .paragraph = 1 } });
        const current = try session.pageControlSources(a, 1);
        defer a.free(current);
        for (before, current) |old, row| {
            try std.testing.expectEqual(old.control_node, row.control_node);
            try std.testing.expectEqual(old.source_unit, row.source_unit);
            if (row.kind == .restart) {
                try std.testing.expectEqual(@as(usize, 1), row.paragraph);
                try std.testing.expectEqual(@as(u32, 1), row.current_unit);
            }
        }
        const restored = try session.copyText(a, 1, 1);
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, text, restored);
        try session.apply(.{ .splice_text = .{ .section = 1, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "후속😀" } });
        try session.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 1, .at_unit = 5 } });
        try session.apply(.{ .merge_paragraph = .{ .section = 1, .paragraph = 1 } });
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        const expected = try session.copyText(a, 1, 1);
        defer a.free(expected);
        const actual = try reopened.copyText(a, 1, 1);
        defer a.free(actual);
        try std.testing.expectEqualSlices(u8, expected, actual);
    }
}

test "page restart split generated native session reuses original binding through repeated splits and merges" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    for ([_]u32{ 0, 8 }) |at| {
        const session = try Session.open(a, input);
        defer session.close();
        const count = try session.paragraphCount(1);
        const text = try session.copyText(a, 1, 1);
        defer a.free(text);
        const before = try session.pageControlSources(a, 1);
        defer a.free(before);
        try session.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 1, .at_unit = 1 } });
        try session.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 2, .at_unit = at } });
        try std.testing.expectEqual(count + 2, try session.paragraphCount(1));
        const current = try session.pageControlSources(a, 1);
        defer a.free(current);
        for (before, current) |original, row| {
            try std.testing.expectEqual(original.control_node, row.control_node);
            try std.testing.expectEqual(original.source_unit, row.source_unit);
            if (row.kind == .restart) {
                try std.testing.expectEqual(@as(usize, if (at == 0) 3 else 2), row.paragraph);
                try std.testing.expectEqual(@as(u32, 0), row.current_unit);
            }
        }
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(count + 2, try reopened.paragraphCount(1));
        try session.apply(.{ .merge_paragraph = .{ .section = 1, .paragraph = 2 } });
        try session.apply(.{ .merge_paragraph = .{ .section = 1, .paragraph = 1 } });
        try std.testing.expectEqual(count, try session.paragraphCount(1));
        const restored = try session.copyText(a, 1, 1);
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, text, restored);
    }
}

test "page restart split transaction preserves current document on writer limit and early allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var before = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer before.deinit(a);
    const command: @import("hwp5/edit/structure_session.zig").Split = .{ .section = 0, .paragraph = 1, .at_unit = 1 };
    const split = @import("hwp5/edit/structure_session.zig").split;
    try std.testing.expectError(error.LimitExceeded, split(a, &.{raw}, &document, source.header.version(), command, 65536, 8));
    try std.testing.expect(@import("model/equality.zig").document(before, document));
    for (0..16) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, split(failure.allocator(), &.{raw}, &document, source.header.version(), command, 65536, 8_000_000));
        try std.testing.expect(@import("model/equality.zig").document(before, document));
    }
    try split(a, &.{raw}, &document, source.header.version(), command, 65536, 8_000_000);
    try std.testing.expectEqual(before.sections[0].paragraphs.len + 1, document.sections[0].paragraphs.len);
}

test "page restart split native session saves relocated control and reopens actual cell" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    for ([_]u32{ 0, 1, 9, 17 }) |at| {
        const session = try Session.open(a, input);
        defer session.close();
        const count = try session.paragraphCount(1);
        const before = try session.pageControlSources(a, 1);
        defer a.free(before);
        try session.apply(.{ .split_paragraph = .{ .section = 1, .paragraph = 1, .at_unit = at } });
        try std.testing.expectEqual(count + 1, try session.paragraphCount(1));
        const current = try session.pageControlSources(a, 1);
        defer a.free(current);
        try std.testing.expectEqual(before.len, current.len);
        for (before, current) |old, row| {
            try std.testing.expectEqual(old.control_node, row.control_node);
            try std.testing.expectEqual(old.source_unit, row.source_unit);
            if (row.kind == .restart) {
                try std.testing.expectEqual(@as(usize, if (at <= 1) 2 else 1), row.paragraph);
                try std.testing.expectEqual(@as(u32, if (at <= 1) 1 - at else 1), row.current_unit);
            }
        }
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(count + 1, try reopened.paragraphCount(1));
        const restored = try reopened.pageControlSources(a, 1);
        defer a.free(restored);
        for (current, restored) |expected, actual| {
            try std.testing.expectEqual(expected.paragraph, actual.paragraph);
            try std.testing.expectEqual(expected.current_unit, actual.current_unit);
            try std.testing.expectEqual(expected.number, actual.number);
            try std.testing.expectEqual(actual.current_unit, actual.source_unit);
        }
        try session.apply(.{ .splice_text = .{ .section = 1, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "이어😀" } });
        const typed = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(typed.bytes);
        const typed_reopened = try Session.open(a, typed.bytes);
        defer typed_reopened.close();
        const typed_text = try session.copyText(a, 1, 2);
        defer a.free(typed_text);
        const actual_text = try typed_reopened.copyText(a, 1, 2);
        defer a.free(actual_text);
        try std.testing.expectEqualSlices(u8, typed_text, actual_text);
        try session.apply(.{ .merge_paragraph = .{ .section = 1, .paragraph = 1 } });
        try std.testing.expectEqual(count, try session.paragraphCount(1));
        const merged = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(merged.bytes);
        const merged_reopened = try Session.open(a, merged.bytes);
        defer merged_reopened.close();
        const merged_rows = try session.pageControlSources(a, 1);
        defer a.free(merged_rows);
        const merged_restored = try merged_reopened.pageControlSources(a, 1);
        defer a.free(merged_restored);
        try std.testing.expectEqual(before.len, merged_rows.len);
        for (merged_rows, merged_restored) |expected, actual| {
            try std.testing.expectEqual(expected.paragraph, actual.paragraph);
            try std.testing.expectEqual(expected.current_unit, actual.current_unit);
            try std.testing.expectEqual(expected.number, actual.number);
        }
    }
}

test "page restart split records relocate one exact header in a complete decoded section" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var tree = try @import("hwp5/edit/source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("hwp5/edit/paragraph_owner.zig").inspectGroups(a, tree, source.header.version());
    defer groups.deinit(a);
    const p = document.sections[0].paragraphs[1];
    const node = try p.originalNode();
    const owner = (try @import("hwp5/edit/paragraph_owner.zig").logicalOwner(tree, groups, node)).?;
    const frame = tree.nodes[node].record.framing;
    var last_right = true;
    for (tree.nodes[node + 1 ..], node + 1..) |entry, index| {
        if (entry.record.value == .header and try @import("hwp5/edit/paragraph_owner.zig").logicalOwner(tree, groups, index) == owner) {
            last_right = false;
            break;
        }
    }
    const end_node = tree.nodes[node].subtree_end;
    const end = if (end_node < tree.nodes.len) tree.nodes[end_node].record.framing.offset else raw.len;
    var before_links = try @import("hwp5/body/control_links.zig").Links.build(a, tree);
    defer before_links.deinit(a);
    for ([_]u32{ 0, 1, 9, 17 }) |at| {
        var draft = try @import("hwp5/edit/page_restart_split_draft.zig").prepare(a, raw, source.header.version(), p, at, 0xfffffffe, 65536);
        defer draft.deinit(a);
        var pair: std.ArrayList(u8) = .empty;
        defer pair.deinit(a);
        const append = @import("hwp5/edit/page_restart_split_records.zig").appendPair;
        try append(a, &pair, raw, source.header.version(), p, draft, at, last_right, 65536, 8_000_000);
        var full: std.ArrayList(u8) = .empty;
        defer full.deinit(a);
        try full.appendSlice(a, raw[0..frame.offset]);
        try full.appendSlice(a, pair.items);
        try full.appendSlice(a, raw[end..]);
        const list = tree.nodes[owner].record.framing;
        const offset = list.offset + list.raw.len - list.payload.len;
        var encoded: [4]u8 = undefined;
        const count = try @import("hwp5/edit/paragraph_list_count.zig").read(tree, owner);
        const incremented = try count.encode(&encoded, 1, 0);
        @memcpy(full.items[offset..][0..incremented.len], incremented);
        var reopened = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{full.items});
        defer reopened.deinit(a);
        try std.testing.expectEqual(document.sections[0].paragraphs.len + 1, reopened.sections[0].paragraphs.len);
        var parsed = try @import("hwp5/edit/source_tree.zig").parse(a, full.items, source.header.version(), .{});
        defer parsed.deinit(a);
        var links = try @import("hwp5/body/control_links.zig").Links.build(a, parsed);
        defer links.deinit(a);
        var current_groups = try @import("hwp5/edit/paragraph_owner.zig").inspectGroups(a, parsed, source.header.version());
        defer current_groups.deinit(a);
        for (reopened.sections[0].paragraphs[1..3]) |part| try std.testing.expectEqual(owner, (try @import("hwp5/edit/paragraph_owner.zig").logicalOwner(parsed, current_groups, try part.originalNode())).?);
        try std.testing.expectEqual(last_right, parsed.nodes[try reopened.sections[0].paragraphs[2].originalNode()].record.value.header.countHighBit());
        try std.testing.expectEqual(before_links.items.len, links.items.len);
        var found: usize = 0;
        const destination: usize = if (at <= 1) 2 else 1;
        for (links.items) |link| if (link.id == @import("hwp5/body/control_rules.zig").id("nwno")) {
            const prior = try planner.read(a, raw, source.header.version(), p, at, 65536);
            try std.testing.expectEqual(try reopened.sections[0].paragraphs[destination].originalNode(), link.paragraph_node);
            try std.testing.expectEqual(@as(usize, if (at <= 1) 1 - at else 1), link.start_unit);
            try std.testing.expectEqualSlices(u8, tree.nodes[prior.control_node].record.framing.raw, parsed.nodes[link.control_node].record.framing.raw);
            found += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), found);
        try std.testing.expectEqual(@as(u32, if (at >= 9) 1 << 21 else 0), parsed.nodes[try reopened.sections[0].paragraphs[1].originalNode()].record.value.header.control_mask & (1 << 21));
        try std.testing.expectEqual(@as(u32, if (at <= 1) 1 << 21 else 0), parsed.nodes[try reopened.sections[0].paragraphs[2].originalNode()].record.value.header.control_mask & (1 << 21));
        var guarded: std.ArrayList(u8) = .empty;
        defer guarded.deinit(a);
        try guarded.appendSlice(a, "guard");
        try std.testing.expectError(error.LimitExceeded, append(a, &guarded, raw, source.header.version(), p, draft, at, false, 65536, guarded.items.len));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        var wrong = draft;
        wrong.right.header_template = 0;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        wrong = draft;
        wrong.right.declared_units += 1;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        wrong = draft;
        wrong.right.text_present = false;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        const forged_tokens = try a.dupe(@import("model/document.zig").Token, draft.right.tokens);
        defer a.free(forged_tokens);
        wrong = draft;
        wrong.right.tokens = forged_tokens;
        forged_tokens[0].start_unit += 1;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        forged_tokens[0] = draft.right.tokens[0];
        forged_tokens[0].kind = if (forged_tokens[0].kind == .text) .control else .text;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        forged_tokens[0] = draft.right.tokens[0];
        forged_tokens[0].encoding = .utf8;
        try std.testing.expectError(error.SourceBindingMismatch, append(a, &guarded, raw, source.header.version(), p, wrong, at, false, 65536, 8_000_000));
        try std.testing.expectEqualSlices(u8, "guard", guarded.items);
        if (at == 1) {
            const resolver = @import("hwp5/edit/current_restart_anchor.zig");
            var selected: ?usize = null;
            for (before_links.items, 0..) |link, index| if (link.paragraph_node == node and link.id == @import("hwp5/body/control_rules.zig").id("nwno")) {
                selected = index;
            };
            const link_index = selected orelse return error.MissingControlToken;
            var duplicate = draft.right;
            duplicate.instance_id = 0xfffffffd;
            try std.testing.expectError(error.AmbiguousRestartSplit, resolver.resolve(a, tree, before_links.items, link_index, &.{ draft.left, draft.right, duplicate }));
            var missing = draft.left;
            missing.source_node = null;
            missing.header_template = draft.left.source_node;
            missing.instance_id = draft.right.instance_id;
            try std.testing.expectError(error.MissingCurrentControlAnchor, resolver.resolve(a, tree, before_links.items, link_index, &.{ draft.left, missing }));
            duplicate = draft.right;
            duplicate.instance_id = draft.left.instance_id;
            try std.testing.expectError(error.InvalidParagraphInstanceId, resolver.resolve(a, tree, before_links.items, link_index, &.{ draft.left, duplicate }));
            try std.testing.expectError(error.SourceBindingMismatch, resolver.resolve(a, tree, before_links.items, link_index, &.{ draft.right, draft.left }));
            var altered = try @import("model/clone.zig").paragraph(a, draft.right);
            defer altered.deinit(a);
            altered.tokens[0].raw[6] ^= 1;
            try std.testing.expectError(error.SourceBindingMismatch, resolver.resolve(a, tree, before_links.items, link_index, &.{ draft.left, altered }));
            try @import("testing/allocation_failures.zig").check(struct {
                fn run(allocator: std.mem.Allocator, source_tree: @import("hwp5/body/tree.zig").Tree, source_links: []const @import("hwp5/body/control_links.zig").Link, index: usize, prepared: @import("hwp5/edit/paragraph_split.zig").Draft) !void {
                    const anchor = try @import("hwp5/edit/current_restart_anchor.zig").resolve(allocator, source_tree, source_links, index, &.{ prepared.left, prepared.right });
                    try std.testing.expectEqual(@as(usize, 1), anchor.paragraph);
                    try std.testing.expectEqual(@as(u32, 0), anchor.unit);
                }
            }.run, .{ tree, before_links.items, link_index, draft });
        }
        if (at == 1) try @import("testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("hwp5/version.zig").Version, original: @import("model/document.zig").Paragraph, prepared: @import("hwp5/edit/paragraph_split.zig").Draft) !void {
                var output: std.ArrayList(u8) = .empty;
                defer output.deinit(allocator);
                try output.appendSlice(allocator, "guard");
                @import("hwp5/edit/page_restart_split_records.zig").appendPair(allocator, &output, bytes, version, original, prepared, 1, false, 65536, 8_000_000) catch |err| {
                    try std.testing.expectEqualSlices(u8, "guard", output.items);
                    return err;
                };
                try std.testing.expect(output.items.len > 5);
                try std.testing.expectEqualSlices(u8, "guard", output.items[0..5]);
            }
        }.run, .{ raw, source.header.version(), p, draft });
    }
}

fn styleAt(p: @import("model/document.zig").Paragraph, unit: usize) u32 {
    var value = p.character_runs[0].char_shape_id;
    for (p.character_runs) |run| {
        if (run.start_unit > unit) break;
        value = run.char_shape_id;
    }
    return value;
}

test "page restart split draft preserves exact control bytes and every character style" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var p = document.sections[0].paragraphs[1];
    var runs = [_]@import("model/document.zig").CharacterRun{
        .{ .start_unit = 0, .char_shape_id = 0 },
        .{ .start_unit = 1, .char_shape_id = 1 },
        .{ .start_unit = 9, .char_shape_id = 2 },
    };
    p.character_runs = &runs;
    const original = try @import("hwp5/edit/plain_text_content.zig").textBytes(a, p);
    defer a.free(original);
    const prepare = @import("hwp5/edit/page_restart_split_draft.zig").prepare;
    for ([_]u32{ 0, 1, 9, 17 }) |at| {
        var draft = try prepare(a, raw, source.header.version(), p, at, 0xfffffffe, 65536);
        defer draft.deinit(a);
        const left = try @import("hwp5/edit/plain_text_content.zig").textBytes(a, draft.left);
        defer a.free(left);
        const right = try @import("hwp5/edit/plain_text_content.zig").textBytes(a, draft.right);
        defer a.free(right);
        try std.testing.expectEqualSlices(u8, original[0 .. @as(usize, at) * 2], left[0 .. left.len - 2]);
        try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, left[left.len - 2 ..]);
        try std.testing.expectEqualSlices(u8, original[@as(usize, at) * 2 ..], right);
        const paragraphs = document.sections[0].paragraphs;
        const current = try a.alloc(@import("model/document.zig").Paragraph, paragraphs.len + 1);
        defer a.free(current);
        current[0] = paragraphs[0];
        current[1] = draft.left;
        current[2] = draft.right;
        @memcpy(current[3..], paragraphs[2..]);
        const getter = @import("hwp5/edit/page_control_sources.zig").read;
        const rows = try getter(a, raw, source.header.version(), current);
        defer a.free(rows);
        var restarts: usize = 0;
        for (rows) |row| if (row.kind == .restart) {
            try std.testing.expectEqual(@as(usize, if (at <= 1) 2 else 1), row.paragraph);
            try std.testing.expectEqual(@as(u32, if (at <= 1) 1 - at else 1), row.current_unit);
            try std.testing.expectEqual(@as(usize, 1), row.source_unit);
            try std.testing.expectEqual(@as(?u16, 1), row.number);
            restarts += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), restarts);
        const destination: usize = if (at <= 1) 2 else 1;
        current[destination].declared_units += 1;
        try std.testing.expectError(error.SourceBindingMismatch, getter(a, raw, source.header.version(), current));
        current[destination].declared_units -= 1;
        current[destination].deferred_direct_records = 0;
        try std.testing.expectError(error.SourceBindingMismatch, getter(a, raw, source.header.version(), current));
        current[destination].deferred_direct_records = 1;
        var controls: usize = 0;
        for ([_]@import("model/document.zig").Paragraph{ draft.left, draft.right }) |part| for (part.tokens) |token| {
            if (token.kind != .control or token.raw.len != 16) continue;
            try std.testing.expectEqualSlices(u8, original[2..18], token.raw);
            controls += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), controls);
        try std.testing.expectEqual(p.source_node, draft.left.source_node);
        try std.testing.expect(draft.right.source_node == null);
        try std.testing.expectEqual(p.source_node, draft.right.header_template);
        try std.testing.expectEqual(@as(u32, 0xfffffffe), draft.right.instance_id);
        try std.testing.expectEqual(@as(usize, if (at >= 9) 1 else 0), draft.left.deferred_direct_records);
        try std.testing.expectEqual(@as(usize, if (at <= 1) 1 else 0), draft.right.deferred_direct_records);
        for (0..left.len / 2 + 1) |unit| try std.testing.expectEqual(styleAt(p, if (unit < at) unit else original.len / 2 - 1), styleAt(draft.left, unit));
        for (0..right.len / 2 + 1) |unit| try std.testing.expectEqual(styleAt(p, at + unit), styleAt(draft.right, unit));
    }
    try std.testing.expectError(error.InvalidParagraphInstanceId, prepare(a, raw, source.header.version(), p, 1, 0, 65536));
    try std.testing.expectError(error.InvalidParagraphInstanceId, prepare(a, raw, source.header.version(), p, 1, p.instance_id, 65536));
    try std.testing.expectError(error.SplitControlToken, prepare(a, raw, source.header.version(), p, 2, 0xfffffffe, 65536));
}

test "page restart split shared projection releases every allocation failure" {
    const a = std.testing.allocator;
    var raw = [_]u8{ 'a', 0, 'b', 0, 'c', 0, 13, 0 };
    var tokens = [_]@import("model/document.zig").Token{
        .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = raw[0..6] },
        .{ .start_unit = 3, .kind = .control, .encoding = .utf16le, .raw = raw[6..] },
    };
    var runs = [_]@import("model/document.zig").CharacterRun{.{ .start_unit = 0, .char_shape_id = 0 }};
    const p: @import("model/document.zig").Paragraph = .{ .source_node = 0, .parent_node = null, .declared_units = 4, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = &tokens, .character_runs = &runs, .deferred_direct_records = 0 };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: @import("model/document.zig").Paragraph) !void {
            var draft = try @import("model/clone.zig").paragraph(allocator, original);
            defer draft.deinit(allocator);
            try @import("hwp5/edit/split_text_projection.zig").replace(allocator, &draft, &.{ 'a', 0, 13, 0 }, 1, 3);
            try std.testing.expectEqual(@as(u32, 2), draft.declared_units);
            try std.testing.expect(draft.range_tags != null);
        }
    }.run, .{p});
    try std.testing.expectEqualSlices(u8, &.{ 'a', 0, 'b', 0, 'c', 0, 13, 0 }, &raw);
}

test "page restart split plan binds actual control and rejects every interior boundary" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const p = document.sections[0].paragraphs[1];
    for ([_]u32{ 0, 1, 9, 17 }) |at| {
        const plan = try planner.read(a, raw, source.header.version(), p, at, 65536);
        try std.testing.expectEqual(@as(usize, 1), plan.source_unit);
        try std.testing.expectEqual(@as(u32, 1), plan.current_unit);
        try std.testing.expectEqual(try p.originalNode(), plan.paragraph_node);
        const destination: @FieldType(planner.Plan, "destination") = if (at <= 1) .right else .left;
        try std.testing.expectEqual(destination, plan.destination);
        try std.testing.expectEqual(if (at <= 1) @as(u32, 1) - at else @as(u32, 1), plan.destination_unit);
    }
    for (2..9) |at| try std.testing.expectError(error.SplitControlToken, planner.read(a, raw, source.header.version(), p, @intCast(at), 65536));
    try std.testing.expectError(error.InvalidTextPosition, planner.read(a, raw, source.header.version(), p, 18, 65536));
    var generated = p;
    generated.source_node = null;
    generated.header_template = p.source_node;
    generated.instance_id = 0;
    try std.testing.expectError(error.UnsupportedStructuralControl, planner.read(a, raw, source.header.version(), generated, 1, 65536));
    generated.instance_id = 0xfffffffe;
    generated.deferred_direct_records = 1;
    const generated_plan = try planner.read(a, raw, source.header.version(), generated, 1, 65536);
    try std.testing.expectEqual(try p.originalNode(), generated_plan.paragraph_node);
    try std.testing.expectEqual(@as(u32, 1), generated_plan.current_unit);
    var wrong_count = p;
    wrong_count.declared_units += 1;
    try std.testing.expectError(error.SourceBindingMismatch, planner.read(a, raw, source.header.version(), wrong_count, 1, 65536));
    for ([_]usize{ 0, 999 }) |count| {
        var wrong_deferred = p;
        wrong_deferred.deferred_direct_records = count;
        try std.testing.expectError(error.SourceBindingMismatch, planner.read(a, raw, source.header.version(), wrong_deferred, 1, 65536));
    }
    for (0..16) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, planner.read(failure.allocator(), raw, source.header.version(), p, 1, 65536));
    }
}

test "page restart split plan follows edited current units without changing source identity" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    const original = try a.dupe(u8, raw);
    defer a.free(original);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const before = try planner.read(a, raw, source.header.version(), document.sections[0].paragraphs[1], 1, 65536);
    try @import("hwp5/edit/paragraph_splice.zig").apply(a, raw, source.header.version(), &document.sections[0], .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" }, 65536);
    const p = document.sections[0].paragraphs[1];
    const moved = try planner.read(a, raw, source.header.version(), p, 4, 65536);
    try std.testing.expectEqual(before.control_node, moved.control_node);
    try std.testing.expectEqual(before.paragraph_node, moved.paragraph_node);
    try std.testing.expectEqual(before.source_unit, moved.source_unit);
    try std.testing.expectEqual(@as(u32, 4), moved.current_unit);
    try std.testing.expectEqual(@as(u32, 0), moved.destination_unit);
    try std.testing.expectEqual(.right, moved.destination);
    const retained = try planner.read(a, raw, source.header.version(), p, 12, 65536);
    try std.testing.expectEqual(.left, retained.destination);
    try std.testing.expectEqual(@as(u32, 4), retained.destination_unit);
    try std.testing.expectError(error.SplitSurrogatePair, planner.read(a, raw, source.header.version(), p, 2, 65536));
    for (p.tokens) |token| if (token.kind == .control and token.raw.len == 16) {
        token.raw[8] ^= 1;
        try std.testing.expectError(error.SourceBindingMismatch, planner.read(a, raw, source.header.version(), p, 4, 65536));
        token.raw[8] ^= 1;
        break;
    };
    try std.testing.expectEqualSlices(u8, original, raw);
}
