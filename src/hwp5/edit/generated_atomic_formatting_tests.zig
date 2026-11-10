//! G02: live generated BODY atomic formatting, with deterministic memory inputs.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Backend = @import("formatting_projection.zig").Backend;
const Service = @import("../../wasm/formatting_service.zig").Service(.hwp5);
const Binding = @import("../../model/formatting_binding.zig").State;
const m = @import("../../model/formatting_patch.zig");
const Query = @import("../../wasm/formatting_query_request.zig");
const a = std.testing.allocator;
const ranges = [_]m.Range{.{ .startUnit = 0, .endUnit = 4 }};
const fields = [_][]const u8{ "character.bold", "character.italic", "character.size", "paragraph.alignment", "reset.style" };

const Harness = struct {
    allocator: std.mem.Allocator,
    session: *edit.Session,
    history: History,
    lifetime: Binding,
    fn init(allocator: std.mem.Allocator) !Harness {
        const input = try @import("../../new_document/root.zig").hwp5(allocator);
        defer allocator.free(input);
        return initInput(allocator, input, 0);
    }
    fn initInput(allocator: std.mem.Allocator, input: []const u8, style: u8) !Harness {
        const session = try edit.Session.open(allocator, input);
        errdefer session.close();
        // Native source coordinates: section and column anchors occupy 16 units.
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "BODY😀AB" } });
        try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 8 } });
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "OTHER" } });
        if (style != 0) try session.apply(.{ .set_style = .{ .section = 0, .paragraph = 1, .style_id = style } });
        var history = try History.initV2(allocator, session, .{ .max_entries = 16 });
        errdefer history.deinit();
        var lifetime: Binding = .{};
        try lifetime.open();
        return .{ .allocator = allocator, .session = session, .history = history, .lifetime = lifetime };
    }
    fn deinit(self: *Harness) void {
        self.lifetime.close();
        self.history.deinit();
        self.session.close();
    }
    fn service(self: *Harness) Service {
        return .{ .backend = .{ .session = self.session, .allocator = self.allocator }, .history = &self.history, .lifetime = &self.lifetime };
    }
    fn binding(self: *Harness) m.Binding {
        return .{ .session = "s1", .revision = self.history.revision() };
    }
    fn save(self: *Harness) ![]u8 {
        return (try self.session.save(self.allocator, .{ .allow_stale_layout = true })).bytes;
    }
    fn query(self: *Harness, paragraph: u32) !std.json.Parsed(std.json.Value) {
        const selectors = [_]Query.Selector{.{ .section = 0, .paragraph = paragraph, .ranges = &ranges }};
        const bytes = try self.service().query(self.allocator, .{ .binding = self.binding(), .selectors = &selectors, .fields = &fields });
        defer self.allocator.free(bytes);
        return std.json.parseFromSlice(std.json.Value, self.allocator, bytes, .{ .allocate = .alloc_always });
    }
};

fn customStyleInput(attributes: u8, missing: bool) ![]u8 {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var it = @import("../record.zig").Iterator.init(info, .{});
    const writer = @import("../record_writer.zig");
    while (try it.next()) |row| {
        if (row.tag == 17) {
            const mappings = try a.dupe(u8, row.payload);
            defer a.free(mappings);
            for ([_]usize{ 9, 13 }) |index| std.mem.writeInt(u32, mappings[index * 4 ..][0..4], 2, .little);
            std.mem.writeInt(u32, mappings[14 * 4 ..][0..4], if (missing) 0 else 2, .little);
            try writer.append(a, &out, row.tag, row.level, mappings, 4_000_000);
            continue;
        }
        if (row.tag == 26 and missing) continue;
        try writer.append(a, &out, row.tag, row.level, row.payload, 4_000_000);
        if (row.tag == 21) {
            const value = try @import("character_property_payload.zig").write(a, row.payload, source.header.version(), .{ .size = 2700, .bold = true }, 4096);
            defer a.free(value);
            try writer.append(a, &out, row.tag, row.level, value, 4_000_000);
        }
        if (row.tag == 25) {
            const value = try @import("paragraph_alignment_payload.zig").write(a, row.payload, source.header.version(), 2, 4096);
            defer a.free(value);
            try writer.append(a, &out, row.tag, row.level, value, 4_000_000);
        }
        if (row.tag == 26) {
            var style: [15]u8 = @splat(0);
            style[4] = attributes;
            std.mem.writeInt(u16, style[6..8], 1042, .little);
            std.mem.writeInt(u16, style[8..10], 1, .little);
            std.mem.writeInt(u16, style[10..12], 1, .little);
            @memcpy(style[12..], &[_]u8{ 0xa5, 0x5a, 0x77 }); // opaque tail must be preserved
            try writer.append(a, &out, row.tag, row.level, &style, 4_000_000);
        }
    }
    return @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = try source.file.readStream(a, "/FileHeader") },
        .{ .name = "DocInfo", .parent = 0, .content = out.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = try source.file.readStream(a, "/BodyText/Section0") },
    }, .{});
}

test "G02 generated atomic nonzero custom style reset scopes and unsupported opaque styles" {
    const input = try customStyleInput(0, false);
    defer a.free(input);
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        var h = try Harness.initInput(a, input, 1);
        defer h.deinit();
        try std.testing.expectEqual(@as(u8, 1), (try h.session.paragraph(0, 1)).style_id);
        try std.testing.expect(try apply(&h, .{ .character = .{ .bold = false, .italic = true, .size = 1900 }, .paragraph = .{ .alignment = .CENTER } }));
        const before = try h.save();
        defer a.free(before);
        const rev = h.history.revision();
        try std.testing.expect(try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(rev + 1, h.history.revision());
        try expectValues(&h, scope != .paragraph, scope == .paragraph, if (scope == .paragraph) 1900 else 2700, if (scope == .character) "CENTER" else "RIGHT");
        const after = try h.save();
        defer a.free(after);
        try std.testing.expect(try h.history.undo(h.session));
        const undo = try h.save();
        defer a.free(undo);
        try std.testing.expectEqualSlices(u8, before, undo);
        try std.testing.expect(try h.history.redo(h.session));
        const redo = try h.save();
        defer a.free(redo);
        try std.testing.expectEqualSlices(u8, after, redo);
    }
    for ([_]u8{ 1, 7 }) |attributes| {
        const unsupported = try customStyleInput(attributes, false);
        defer a.free(unsupported);
        var h = try Harness.initInput(a, unsupported, 1);
        defer h.deinit();
        try std.testing.expect(try apply(&h, .{ .character = .{ .italic = true } }));
        try std.testing.expect(try h.history.undo(h.session));
        const before = try h.save();
        defer a.free(before);
        const stats = h.history.stats();
        for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| try std.testing.expectError(error.UnsupportedResetStyle, apply(&h, .{ .reset = scope }));
        try std.testing.expectEqualDeep(stats, h.history.stats());
        const after = try h.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expect(try h.history.redo(h.session));
    }
    const missing = try customStyleInput(0, true);
    defer a.free(missing);
    // Public input admission rejects a missing Style before a live session exists.
    try std.testing.expectError(error.InvalidStyleReference, edit.Session.open(a, missing));
}

const Stress = struct {
    raw: []u8,
    document: @import("../../model/document.zig").Document,
    fn deinit(self: *Stress) void {
        self.document.deinit(a);
        a.free(self.raw);
    }
};
fn stressInput(count: usize) !Stress {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    for (0..count) |index| {
        var header: [22]u8 = @splat(0);
        std.mem.writeInt(u32, header[0..4], 2, .little);
        std.mem.writeInt(u16, header[12..14], 1, .little);
        std.mem.writeInt(u32, header[18..22], @intCast(index + 1), .little);
        try @import("../record_writer.zig").append(a, &raw, 66, 0, &header, 4_000_000);
        try @import("../record_writer.zig").append(a, &raw, 67, 1, &.{ 'x', 0, 13, 0 }, 4_000_000);
        try @import("../record_writer.zig").append(a, &raw, 68, 1, &(@as([8]u8, @splat(0))), 4_000_000);
    }
    var document = try @import("../model_projection.zig").fromDecodedSections(a, .{ .raw = 0x05000107 }, &.{raw.items});
    errdefer document.deinit(a);
    const old = document.sections[0].paragraphs;
    var paragraphs: std.ArrayList(@import("../../model/document.zig").Paragraph) = .empty;
    errdefer {
        for (paragraphs.items) |*paragraph| paragraph.deinit(a);
        paragraphs.deinit(a);
    }
    try paragraphs.ensureTotalCapacity(a, count * 2);
    paragraphs.appendAssumeCapacity(try @import("../../model/clone.zig").paragraph(a, old[0]));
    for (0..count) |index| {
        var generated = try @import("../../model/clone.zig").paragraph(a, old[0]);
        generated.source_node = null;
        generated.header_template = 0;
        generated.instance_id = @intCast(count + 100 + index);
        paragraphs.appendAssumeCapacity(generated);
    }
    for (old[1..]) |paragraph| paragraphs.appendAssumeCapacity(try @import("../../model/clone.zig").paragraph(a, paragraph));
    const owned = try paragraphs.toOwnedSlice(a);
    for (old) |*paragraph| paragraph.deinit(a);
    a.free(old);
    document.sections[0].paragraphs = owned;
    return .{ .raw = try raw.toOwnedSlice(a), .document = document };
}
fn samePlan(tree: @import("../body/tree.zig").Tree, section: @import("../../model/document.zig").Section, allow_deletions: bool) !void {
    var expected = frozenLegacyPlan(a, tree, section, .{ .raw = 0x05000107 }, allow_deletions) catch |err| {
        try std.testing.expectError(err, @import("structure_plan.zig").buildWithDeletions(a, tree, section, .{ .raw = 0x05000107 }, allow_deletions));
        return;
    };
    defer expected.deinit(a);
    var actual = try @import("structure_plan.zig").buildWithDeletions(a, tree, section, .{ .raw = 0x05000107 }, allow_deletions);
    defer actual.deinit(a);
    try std.testing.expectEqualDeep(expected, actual);
}

fn rawOwnershipCase(kind: usize) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    const append = @import("../record_writer.zig").append;
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 1, .little);
    var list: [8]u8 = @splat(0);
    std.mem.writeInt(u16, list[0..2], if (kind == 7) 2 else 1, .little);
    try append(a, &bytes, 66, 0, &header, 4096);
    switch (kind) {
        0 => try append(a, &bytes, 66, 0, &header, 4096),
        1, 7 => {
            try append(a, &bytes, 72, 1, &list, 4096);
            try append(a, &bytes, 66, 1, &header, 4096);
        },
        2 => try append(a, &bytes, 999, 1, "opaque", 4096),
        3 => {
            try append(a, &bytes, 71, 1, "xxxx", 4096);
            try append(a, &bytes, 999, 2, "opaque", 4096);
        },
        4 => {
            // Main's reviewed raw orphan: Groups.build already rejects this;
            // it is not evidence of a newly introduced Flows rejection.
            try append(a, &bytes, 71, 1, "xxxx", 4096);
            try append(a, &bytes, 66, 2, &header, 4096);
        },
        5 => {
            // Deferred unknown control with a structurally valid owned list.
            // Original preservation must not require control semantic support.
            try append(a, &bytes, 71, 1, "xxxx", 4096);
            try append(a, &bytes, 72, 2, &list, 4096);
            try append(a, &bytes, 66, 2, &header, 4096);
        },
        6 => try append(a, &bytes, 72, 0, &list, 4096),
        8 => try append(a, &bytes, 71, 1, "xx", 4096),
        9 => try append(a, &bytes, 999, 3, "bad hierarchy", 4096),
        else => unreachable,
    }
    return bytes.toOwnedSlice(a);
}

fn ownershipDifferential(raw: []const u8, version: @import("../version.zig").Version, comparisons: *usize) !void {
    var tree = @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{}) catch |err| {
        // Both implementations consume this exact parser. Malformed hierarchy
        // is rejected before either planner, never reclassified as a flow error.
        try std.testing.expectEqual(error.InvalidRecordHierarchy, err);
        return;
    };
    defer tree.deinit(a);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const section = &document.sections[0];
    const original = section.paragraphs;
    // Parser provenance is the precondition for Groups => Flows. A forged
    // arbitrary Node array is not confused with an immutable parsed source.
    for (tree.nodes, 0..) |node, index| {
        try std.testing.expect(node.subtree_end > index and node.subtree_end <= tree.nodes.len);
        if (node.parent) |parent| {
            try std.testing.expect(parent < index);
            try std.testing.expectEqual(tree.nodes[parent].record.framing.level + 1, node.record.framing.level);
            try std.testing.expect(node.subtree_end <= tree.nodes[parent].subtree_end);
        } else try std.testing.expectEqual(@as(u10, 0), node.record.framing.level);
    }
    if (@import("paragraph_owner.zig").inspectGroups(a, tree, version)) |value| {
        var groups = value;
        defer groups.deinit(a);
        // A successful Groups.build gives every non-root header exactly one
        // direct sibling group. Flows adds no source rejection on parsed trees.
        var flows = try @import("../body/paragraph_flows.zig").Flows.build(a, tree, groups.items);
        defer flows.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.value != .header) continue;
            const old_owner = try @import("paragraph_owner.zig").logicalOwner(tree, groups, index);
            try std.testing.expectEqual(old_owner orelse 0, try flows.get(index));
        }
    } else |_| {} // Exact shared inspectGroups failure is compared below.
    for ([_]bool{ false, true }) |deletions| {
        try samePlan(tree, section.*, deletions);
        comparisons.* += 1;
    }
    // An invalid current source slot must retain the old error priority,
    // including sources already rejected by the shared inspectGroups gate.
    const first = original[0];
    original[0].source_node = @intCast(tree.nodes.len);
    for ([_]bool{ false, true }) |deletions| {
        try samePlan(tree, section.*, deletions);
        comparisons.* += 1;
    }
    original[0] = first;
    if (original.len > 1) {
        std.mem.swap(@TypeOf(original[0]), &original[0], &original[original.len - 1]);
        for ([_]bool{ false, true }) |deletions| {
            try samePlan(tree, section.*, deletions);
            comparisons.* += 1;
        }
        std.mem.swap(@TypeOf(original[0]), &original[0], &original[original.len - 1]);
        section.paragraphs = original[0 .. original.len - 1];
        for ([_]bool{ false, true }) |deletions| {
            try samePlan(tree, section.*, deletions);
            comparisons.* += 1;
        }
        section.paragraphs = original;
    }
    // Insert one generated continuation after each immutable source template.
    // No legacy fixture or independent implementation participates here.
    for (original, 0..) |paragraph, at| {
        const current = try a.alloc(@TypeOf(paragraph), original.len + 1);
        defer a.free(current);
        @memcpy(current[0 .. at + 1], original[0 .. at + 1]);
        current[at + 1] = paragraph;
        current[at + 1].source_node = null;
        current[at + 1].header_template = paragraph.source_node;
        current[at + 1].instance_id = 0xfffffffe;
        @memcpy(current[at + 2 ..], original[at + 1 ..]);
        section.paragraphs = current;
        defer section.paragraphs = original;
        for (0..4) |mutation| {
            const saved = current[at + 1];
            if (mutation == 1) current[at + 1].header_template = null;
            if (mutation == 2) current[at + 1].instance_id = 0;
            if (mutation == 3) current[at + 1].parent_node = if (paragraph.parent_node == null) 0 else null;
            for ([_]bool{ false, true }) |deletions| {
                try samePlan(tree, section.*, deletions);
                comparisons.* += 1;
            }
            current[at + 1] = saved;
        }
    }
}

test "G02 generated atomic parsed root nested opaque malformed source differential" {
    var comparisons: usize = 0;
    for (0..10) |kind| {
        const raw = try rawOwnershipCase(kind);
        defer a.free(raw);
        try ownershipDifferential(raw, .{ .raw = 0x05000107 }, &comparisons);
    }
    const table = try tableInput();
    defer a.free(table);
    var source = try @import("../text_source.zig").Source.open(a, table);
    defer source.deinit();
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    try ownershipDifferential(body, source.header.version(), &comparisons);
    try std.testing.expect(comparisons >= 100);
}

test "G02 generated atomic structural indexes doubling counts and frozen error priority" {
    var previous: usize = 0;
    for ([_]usize{ 64, 128, 256 }) |count| {
        var stress = try stressInput(count);
        defer stress.deinit();
        var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, stress.raw, .{ .raw = 0x05000107 }, .{});
        defer tree.deinit(a);
        for ([_]bool{ false, true }) |deletions| try samePlan(tree, stress.document.sections[0], deletions);
        @import("structure_plan.zig").test_work = .{};
        var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, stress.document.sections[0], .{ .raw = 0x05000107 }, true);
        defer plan.deinit(a);
        const work = @import("structure_plan.zig").test_work;
        const steps = work.source_visits + work.current_visits + work.instance_probes + work.following_probes;
        try std.testing.expectEqual(@as(usize, 1), work.owner_validations);
        try std.testing.expect(steps <= count * 12);
        if (previous != 0) try std.testing.expect(steps <= previous * 2);
        previous = steps;
        const section = &stress.document.sections[0];
        const generated = &section.paragraphs[1];
        const good = generated.*;
        generated.instance_id = section.paragraphs[0].instance_id;
        try samePlan(tree, section.*, true);
        generated.* = good;
        generated.header_template = null;
        try samePlan(tree, section.*, true);
        generated.* = good;
        generated.parent_node = 0;
        try samePlan(tree, section.*, true);
        generated.* = good;
        // Following errors take precedence over later main-loop ID validation.
        section.paragraphs[2].header_template = null;
        section.paragraphs[2].instance_id = 0;
        try samePlan(tree, section.*, true);
    }
}

test "G02 generated atomic many removals without restart avoid current by deletion scans" {
    var previous: usize = 0;
    for ([_]usize{ 64, 128, 256 }) |count| {
        var stress = try stressInput(count);
        defer stress.deinit();
        var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, stress.raw, .{ .raw = 0x05000107 }, .{});
        defer tree.deinit(a);
        const section = &stress.document.sections[0];
        const original = section.paragraphs;
        section.paragraphs = original[0 .. count + 1];
        defer section.paragraphs = original;
        try samePlan(tree, section.*, true);
        @import("structure_plan.zig").test_work = .{};
        var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, section.*, .{ .raw = 0x05000107 }, true);
        defer plan.deinit(a);
        const work = @import("structure_plan.zig").test_work;
        try std.testing.expectEqual(count - 1, plan.removals.len);
        try std.testing.expectEqual(count + 1, work.restart_presence_checks);
        try std.testing.expectEqual(count - 1, work.removal_visits);
        try std.testing.expectEqual(@as(usize, 0), work.restart_checks);
        const steps = work.restart_presence_checks + work.removal_visits + work.restart_checks;
        if (previous != 0) try std.testing.expectEqual(previous * 2, steps);
        previous = steps;
    }
}

test "G02 generated atomic bulk query doubling counts one flow and one protection read" {
    var previous: usize = 0;
    for ([_]usize{ 64, 128, 256 }) |count| {
        var stress = try stressInput(count);
        defer stress.deinit();
        const template = try @import("../../new_document/root.zig").hwp5(a);
        defer a.free(template);
        var source = try @import("../text_source.zig").Source.open(a, template);
        defer source.deinit();
        const input = try @import("../../cfb/writer.zig").write(a, &.{
            .{ .name = "Root Entry", .kind = 5 },
            .{ .name = "FileHeader", .parent = 0, .content = try source.file.readStream(a, "/FileHeader") },
            .{ .name = "DocInfo", .parent = 0, .content = try source.file.readStream(a, "/DocInfo") },
            .{ .name = "BodyText", .parent = 0, .kind = 1 },
            .{ .name = "Section0", .parent = 3, .content = stress.raw },
        }, .{});
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        var empty = [_]@import("created_table_values.zig").Values{.{}};
        const draft = try @import("table_checkpoint.zig").capture(a, session, &stress.document, &empty, 4_000_000);
        defer draft.deinit();
        try session.restoreCheckpoint(draft);
        var history = try History.initV2(a, session, .{});
        defer history.deinit();
        var lifetime: Binding = .{};
        try lifetime.open();
        const service: Service = .{ .backend = .{ .allocator = a, .session = session }, .history = &history, .lifetime = &lifetime };
        const selectors = try a.alloc(Query.Selector, count);
        defer a.free(selectors);
        for (selectors, 1..) |*selector, paragraph| selector.* = .{ .section = 0, .paragraph = @intCast(paragraph), .ranges = &.{} };
        @import("structure_plan.zig").test_work = .{};
        @import("formatting_projection.zig").test_work = .{};
        const bytes = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = selectors, .fields = &.{"paragraph.alignment"} });
        defer a.free(bytes);
        const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        try std.testing.expectEqual(count, parsed.value.object.get("targets").?.array.items.len);
        try std.testing.expectEqual(@as(usize, 1), @import("formatting_projection.zig").test_work.ownership_reads);
        try std.testing.expectEqual(@as(usize, 1), @import("formatting_projection.zig").test_work.protection_reads);
        const work = @import("structure_plan.zig").test_work;
        const steps = work.source_visits + work.current_visits + work.instance_probes + work.following_probes;
        if (previous != 0) try std.testing.expect(steps <= previous * 2);
        previous = steps;
        if (count == 64) {
            for (selectors) |*selector| selector.ranges = &.{.{ .startUnit = 0, .endUnit = 1 }};
            @import("formatting_projection.zig").test_work = .{};
            const all = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = selectors, .fields = null });
            defer a.free(all);
            const resource_work = @import("formatting_projection.zig").test_work;
            try std.testing.expectEqual(@as(usize, 1), resource_work.ownership_reads);
            try std.testing.expectEqual(@as(usize, 1), resource_work.protection_reads);
            try std.testing.expectEqual(@as(usize, 1), resource_work.formatting_sources);
            try std.testing.expectEqual(@as(usize, 1), resource_work.reset_reads);
            try std.testing.expectEqual(@as(usize, 1), resource_work.character_border_reads);
            try std.testing.expectEqual(@as(usize, 1), resource_work.paragraph_border_reads);
        }
    }
}

test "G02 generated atomic live retained protected owner exact rollback and protection snapshot reuse" {
    const input = try @import("company_synthetic_fixture.zig").build(a, .positive);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    const service: Service = .{ .backend = .{ .session = session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    const before = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(before);
    const stats = history.stats();
    var snapshot: Backend.Snapshot = .{ .allocator = a };
    defer snapshot.deinit();
    var backend = service.backend;
    backend.snapshot = &snapshot;
    @import("formatting_projection.zig").test_work = .{};
    try backend.authorizeOwner(.{ .section = 0, .paragraph = 1 });
    try std.testing.expectError(error.ProtectedFormattingOwner, backend.authorizeOwner(.{ .section = 0, .paragraph = 2 }));
    try backend.authorizeOwner(.{ .section = 0, .paragraph = 3 });
    try std.testing.expectEqual(@as(usize, 1), @import("formatting_projection.zig").test_work.protection_reads);
    try std.testing.expectEqual(.retained_company, snapshot.protections.get(0).?.mode);
    const selected = [_]Query.Selector{.{ .section = 0, .paragraph = 2, .ranges = &.{} }};
    const bytes = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &selected, .fields = &.{"paragraph.alignment"} });
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const value = parsed.value.object.get("observations").?.object.get("aggregate").?.object.get("paragraph.alignment").?;
    try std.testing.expect(!value.object.get("writable").?.bool);
    try std.testing.expectEqualStrings("ProtectedFormattingOwner", value.object.get("writeUnavailableReason").?.string);
    const requested = [_]m.Target{.{ .ref = target(parsed.value).ref, .ranges = &.{} }};
    try std.testing.expectError(error.FormattingTargetNotWritable, service.apply(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .targets = &requested, .patch = .{ .paragraph = .{ .alignment = .CENTER } } }));
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        const reset_targets = [_]m.Target{.{ .ref = requested[0].ref, .ranges = if (scope == .paragraph) &.{} else &.{.{ .startUnit = 0, .endUnit = 8 }} }};
        try std.testing.expectError(if (scope == .paragraph) error.ProtectedFormattingOwner else error.UnsupportedControlDeletion, service.apply(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .targets = &reset_targets, .patch = .{ .reset = scope } }));
    }
    try std.testing.expectEqualDeep(stats, history.stats());
    const after = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "G02 generated atomic failed retained protection is cached once per immutable section" {
    const input = try @import("company_synthetic_fixture.zig").build(a, .duplicate_id);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var snapshot: Backend.Snapshot = .{ .allocator = a };
    defer snapshot.deinit();
    const backend: Backend = .{ .allocator = a, .session = session, .snapshot = &snapshot };
    @import("formatting_projection.zig").test_work = .{};
    for ([_]usize{ 1, 2, 3, 4, 1 }) |paragraph| try std.testing.expectError(error.DuplicateFieldInstance, backend.authorizeOwner(.{ .section = 0, .paragraph = paragraph }));
    try std.testing.expectEqual(@as(usize, 1), @import("formatting_projection.zig").test_work.protection_reads);
    try std.testing.expectEqual(@as(u32, 1), snapshot.protection_errors.count());
}

test "G02 generated atomic missing live style fault fails reset without altering checkpoint or history" {
    // Missing style is unreachable via normal open/set_style admission (tested
    // above). Inject it through an explicitly caller-owned native checkpoint to
    // exercise the deeper reset resolver without weakening product admission.
    var h = try Harness.init(a);
    defer h.deinit();
    const input = try h.save();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    try @import("paragraph_split.zig").apply(a, &document.sections[0], raw, source.header.version(), 1, 0, 0xfffffffe, 1);
    document.sections[0].paragraphs[2].style_id = 255;
    var empty = [_]@import("created_table_values.zig").Values{.{}};
    const fault = try @import("table_checkpoint.zig").capture(a, session, &document, &empty, 4_000_000);
    defer fault.deinit();
    try session.restoreCheckpoint(fault);
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    const service: Service = .{ .backend = .{ .session = session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    const checkpoint = try session.createCheckpoint(4_000_000);
    defer checkpoint.deinit();
    const stats = history.stats();
    const reference = try lifetime.reference(a, .{ .section = 0, .paragraph = 2 });
    defer a.free(reference);
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        try std.testing.expectError(error.MissingResetStyle, service.apply(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .targets = &.{.{ .ref = reference, .ranges = if (scope == .paragraph) &.{} else &ranges }}, .patch = .{ .reset = scope } }));
        try std.testing.expect(try session.matchesCheckpoint(checkpoint));
        try std.testing.expectEqualDeep(stats, history.stats());
    }
}
fn target(q: std.json.Value) m.Target {
    return .{ .ref = q.object.get("targets").?.array.items[0].object.get("ref").?.string, .ranges = &ranges };
}
fn observation(q: std.json.Value, field: []const u8) std.json.Value {
    return q.object.get("observations").?.object.get("aggregate").?.object.get(field).?.object.get("value").?;
}
fn apply(h: *Harness, patch: m.Patch) !bool {
    const q = try h.query(1);
    defer q.deinit();
    return h.service().apply(h.allocator, .{ .binding = h.binding(), .targets = &.{target(q.value)}, .patch = patch });
}
fn expectValues(h: *Harness, bold: bool, italic: bool, size: i64, alignment: []const u8) !void {
    const q = try h.query(1);
    defer q.deinit();
    try std.testing.expectEqual(bold, observation(q.value, "character.bold").bool);
    try std.testing.expectEqual(italic, observation(q.value, "character.italic").bool);
    try std.testing.expectEqual(size, observation(q.value, "character.size").integer);
    try std.testing.expectEqualStrings(alignment, observation(q.value, "paragraph.alignment").string);
}
fn untouched(before: []const u8, after: []const u8) !void {
    var x = try @import("../text_source.zig").Source.open(a, before);
    defer x.deinit();
    var y = try @import("../text_source.zig").Source.open(a, after);
    defer y.deinit();
    try std.testing.expectEqualSlices(u8, try x.file.readStream(a, "/FileHeader"), try y.file.readStream(a, "/FileHeader"));
    const xb = try x.decodeSection(a, 0);
    defer a.free(xb);
    const yb = try y.decodeSection(a, 0);
    defer a.free(yb);
    // All source metadata records remain exact; only paragraph headers/runs may change.
    var xi = @import("../record.zig").Iterator.init(xb, .{});
    var yi = @import("../record.zig").Iterator.init(yb, .{});
    var paragraph: usize = 0;
    var headers: usize = 0;
    while (try xi.next()) |record| {
        const other = (try yi.next()) orelse return error.MissingRecord;
        try std.testing.expectEqual(record.tag, other.tag);
        try std.testing.expectEqual(record.level, other.level);
        if (record.tag == 66) {
            paragraph = headers;
            headers += 1;
        }
        if (paragraph != 1 or (record.tag != 66 and record.tag != 68)) try std.testing.expectEqualSlices(u8, record.payload, other.payload);
    }
    try std.testing.expect((try yi.next()) == null);
    const xd = try x.decodeDocInfo(a, 4_000_000);
    defer a.free(xd);
    const yd = try y.decodeDocInfo(a, 4_000_000);
    defer a.free(yd);
    var originals = @import("../record.zig").Iterator.init(xd, .{});
    var ordinals: [1024]usize = @splat(0);
    while (try originals.next()) |record| {
        const ordinal = ordinals[record.tag];
        ordinals[record.tag] += 1;
        if (record.tag == 17) continue; // resource counts change, existing resources do not
        var current = @import("../record.zig").Iterator.init(yd, .{});
        var count: usize = 0;
        var found = false;
        while (try current.next()) |candidate| {
            if (candidate.tag != record.tag) continue;
            defer count += 1;
            if (count != ordinal) continue;
            try std.testing.expectEqual(record.level, candidate.level);
            try std.testing.expectEqualSlices(u8, record.payload, candidate.payload);
            found = true;
            break;
        }
        try std.testing.expect(found);
    }
}

test "G02 generated atomic query combined patch single history noop undo redo source preservation" {
    var h = try Harness.init(a);
    defer h.deinit();
    try std.testing.expect((try h.session.currentSourceParagraphReference(0, 1)).source.host == .generated_instance);
    const before = try h.save();
    defer a.free(before);
    const other = try h.session.copyText(a, 0, 2);
    defer a.free(other);
    try expectValues(&h, false, false, 1100, "LEFT");
    const patch: m.Patch = .{ .character = .{ .bold = true, .italic = true, .size = 1900 }, .paragraph = .{ .alignment = .CENTER } };
    try std.testing.expect(try apply(&h, patch));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    try std.testing.expectEqual(@as(usize, 1), h.history.stats().undoCount);
    try expectValues(&h, true, true, 1900, "CENTER");
    const after = try h.save();
    defer a.free(after);
    try untouched(before, after);
    try std.testing.expect(!try apply(&h, patch));
    try std.testing.expect(!try apply(&h, .{}));
    try std.testing.expectEqual(@as(u32, 1), h.history.revision());
    const other_after = try h.session.copyText(a, 0, 2);
    defer a.free(other_after);
    try std.testing.expectEqualSlices(u8, other, other_after);
    try std.testing.expect(try h.history.undo(h.session));
    const undone = try h.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.history.redo(h.session));
    const redone = try h.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}

test "G02 generated atomic three paragraph style reset scopes" {
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        var h = try Harness.init(a);
        defer h.deinit();
        try std.testing.expect(try apply(&h, .{ .character = .{ .bold = true, .italic = true, .size = 1900 }, .paragraph = .{ .alignment = .RIGHT } }));
        const before = try h.save();
        defer a.free(before);
        const revision = h.history.revision();
        try std.testing.expect(try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(revision + 1, h.history.revision());
        try expectValues(&h, scope == .paragraph, scope == .paragraph, if (scope == .paragraph) 1900 else 1100, if (scope == .character) "RIGHT" else "LEFT");
        const after = try h.save();
        defer a.free(after);
        try std.testing.expect(!try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(revision + 1, h.history.revision());
        try std.testing.expect(try h.history.undo(h.session));
        const undone = try h.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try h.history.redo(h.session));
        const redone = try h.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, after, redone);
    }
}

test "G02 generated atomic query-issued tokens stable within epoch and checked with revision and lifetime" {
    var h = try Harness.init(a);
    defer h.deinit();
    const initial = try h.query(1);
    defer initial.deinit();
    const old_binding = h.binding();
    const old_target = target(initial.value);
    try std.testing.expect(try apply(&h, .{ .character = .{ .bold = true } }));
    const current = try h.query(1);
    defer current.deinit();
    try std.testing.expectEqualStrings(old_target.ref, target(current.value).ref);
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, .{ .binding = old_binding, .targets = &.{old_target}, .patch = .{ .character = .{ .italic = true } } }));
    // Tokens encode epoch + coordinates, not a generated instance ID. The
    // unchanged token is usable only with its matching live binding/owner.
    const selectors = [_]Query.Selector{
        .{ .section = 0, .paragraph = 1, .ranges = &.{} },
        .{ .section = 0, .paragraph = 2, .ranges = &.{} },
    };
    const only_binding = try h.service().query(a, .{ .binding = h.binding(), .selectors = &selectors, .fields = &.{} });
    defer a.free(only_binding);
    const all_fields = try h.service().query(a, .{ .binding = h.binding(), .selectors = &selectors, .fields = null });
    defer a.free(all_fields);
    const old_stats = h.history.stats();
    h.lifetime = try h.lifetime.next();
    const fresh: m.Binding = .{ .session = "s2", .revision = h.history.revision() };
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, .{ .binding = fresh, .targets = &.{old_target}, .patch = .{ .character = .{ .italic = true } } }));
    const next = try h.service().query(a, .{ .binding = fresh, .selectors = &selectors, .fields = &.{} });
    defer a.free(next);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, next, .{});
    defer parsed.deinit();
    const next_ref = parsed.value.object.get("targets").?.array.items[0].object.get("ref").?.string;
    try std.testing.expect(!std.mem.eql(u8, old_target.ref, next_ref));
    try std.testing.expectEqualDeep(old_stats, h.history.stats());
}

test "G02 generated atomic late mixed target rejection stale binding scalar and protected anchors preserve redo" {
    var h = try Harness.init(a);
    defer h.deinit();
    try std.testing.expect(try apply(&h, .{ .character = .{ .bold = true } }));
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.save();
    defer a.free(before);
    const stats = h.history.stats();
    const q = try h.query(1);
    defer q.deinit();
    const q2 = try h.query(2);
    defer q2.deinit();
    var bad = target(q2.value);
    bad.ranges = &.{.{ .startUnit = 0, .endUnit = 999 }};
    try std.testing.expectError(error.InvalidTextPosition, h.service().apply(a, .{ .binding = h.binding(), .targets = &.{ target(q.value), bad }, .patch = .{ .character = .{ .italic = true } } }));
    const split_scalar = [_]Query.Selector{.{ .section = 0, .paragraph = 1, .ranges = &.{.{ .startUnit = 5, .endUnit = 6 }} }};
    try std.testing.expectError(error.SplitSurrogatePair, h.service().query(a, .{ .binding = h.binding(), .selectors = &split_scalar, .fields = &.{} }));
    const control = [_]Query.Selector{.{ .section = 0, .paragraph = 0, .ranges = &.{.{ .startUnit = 0, .endUnit = 1 }} }};
    try std.testing.expectError(error.SplitControlToken, h.service().query(a, .{ .binding = h.binding(), .selectors = &control, .fields = &.{} }));
    var stale = h.binding();
    stale.revision = 999;
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, .{ .binding = stale, .targets = &.{target(q.value)}, .patch = .{ .character = .{ .bold = true } } }));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    const after = try h.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try h.history.redo(h.session));
    try expectValues(&h, true, false, 1100, "LEFT");
    const captured = try h.session.currentSourceParagraphReference(0, 2);
    const old_binding = h.binding();
    try std.testing.expect(try h.history.apply(h.session, .{ .merge_paragraph = .{ .section = 0, .paragraph = 1 } }));
    try std.testing.expectError(error.MissingParagraphSource, h.session.copyCurrentParagraphTextUtf16(a, 0, captured));
    try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, .{ .binding = old_binding, .targets = &.{target(q.value)}, .patch = .{ .character = .{ .bold = true } } }));
}

const table_options: @import("created_table_records.zig").Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "G02" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};
fn tableInput() ![]u8 {
    var h = try Harness.init(a);
    defer h.deinit();
    var ids = try h.session.planTableIds(1);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 18000, 1800, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "CELL😀AB", 100);
    try h.session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 2, .unit = 0, .table = &table, .options = table_options } });
    return h.save();
}

test "G02 generated atomic immutable template body proof original nested admission and snapshot reuse" {
    const input = try tableInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    const service: Service = .{ .backend = .{ .session = session, .allocator = a }, .lifetime = &lifetime, .history = &history };
    const flow = try session.paragraphFlow(a, 0);
    defer a.free(flow);
    var cell: usize = 0;
    for (flow) |row| if (row.host == .table_cell) {
        cell = row.paragraph;
        break;
    };
    try std.testing.expect(cell > 0);
    _ = try service.backend.owner(.{ .section = 0, .paragraph = cell });
    const selected = [_]Query.Selector{.{ .section = 0, .paragraph = @intCast(cell), .ranges = &ranges }};
    const original_query = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &selected, .fields = &fields });
    defer a.free(original_query);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, original_query, .{});
    defer parsed.deinit();
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .targets = &.{target(parsed.value)}, .patch = .{ .character = .{ .italic = true } } }));
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = cell, .at_unit = 0 } }));
    const nested = try session.currentSourceParagraphReference(0, cell + 1);
    try std.testing.expect(nested.source.host == .generated_instance);
    try std.testing.expectError(error.UnsupportedFormattingOwner, service.backend.owner(.{ .section = 0, .paragraph = cell + 1 }));
    const nested_selectors = [_]Query.Selector{.{ .section = 0, .paragraph = @intCast(cell + 1), .ranges = &ranges }};
    try std.testing.expectError(error.UnsupportedFormattingOwner, service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &nested_selectors, .fields = &.{} }));
    // Both BODY continuations share one immutable template and one flow snapshot.
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } }));
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 2, .at_unit = 0 } }));
    var snapshot: Backend.Snapshot = .{ .allocator = a };
    defer snapshot.deinit();
    var backend = service.backend;
    backend.snapshot = &snapshot;
    _ = try backend.owner(.{ .section = 0, .paragraph = 2 });
    const first = snapshot.ownership_flows.get(0).?.ptr;
    _ = try backend.owner(.{ .section = 0, .paragraph = 3 });
    try std.testing.expectEqual(@as(u32, 1), snapshot.ownership_flows.count());
    try std.testing.expectEqual(first, snapshot.ownership_flows.get(0).?.ptr);
}

test "G02 generated atomic immutable nested template rejects forged parent and duplicate generated identity" {
    const input = try tableInput();
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const original = try @import("paragraph_flow_snapshot.zig").read(a, raw, source.header.version(), document.sections[0]);
    defer a.free(original);
    var cell: usize = 0;
    for (original) |row| if (row.host == .table_cell) {
        cell = row.paragraph;
        break;
    };
    try std.testing.expect(cell > 0);
    try @import("paragraph_split.zig").apply(a, &document.sections[0], raw, source.header.version(), cell, 0, 0xfffffffe, 1);
    const paragraph = &document.sections[0].paragraphs[cell + 1];
    const parent = paragraph.parent_node;
    try std.testing.expect(parent != null);
    // Reuse the exact typed SSOT called by Backend; forged current metadata
    // cannot reclassify the immutable CELL template as BODY.
    paragraph.parent_node = null;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_flow_snapshot.zig").read(a, raw, source.header.version(), document.sections[0]));
    paragraph.parent_node = parent;
    paragraph.instance_id = document.sections[0].paragraphs[cell].instance_id;
    try std.testing.expectError(error.InvalidParagraphInstanceId, @import("paragraph_flow_snapshot.zig").read(a, raw, source.header.version(), document.sections[0]));
    paragraph.instance_id = 0xfffffffe;
    const rows = try @import("paragraph_flow_snapshot.zig").read(a, raw, source.header.version(), document.sections[0]);
    defer a.free(rows);
    try std.testing.expectEqual(.table_cell, rows[cell + 1].host);
    try std.testing.expect(!rows[cell + 1].top_level);
}

// Bounded sampled allocation injection. It covers both read planning and the
// actual History transaction; it does not claim an exhaustive OOM sweep.
test "G02 generated atomic bounded allocation failures query plan transaction rollback" {
    const modes = enum { query, plan, transaction };
    for ([_]modes{ .query, .plan, .transaction }) |mode| {
        var measured: usize = 0;
        var failures: usize = 0;
        const samples = 32;
        var sample: usize = 0;
        while (sample <= samples) : (sample += 1) {
            if (sample > 0 and sample > measured) break;
            var failing = std.testing.FailingAllocator.init(a, .{});
            const fa = failing.allocator();
            var h = try Harness.init(fa);
            defer h.deinit();
            const before = try h.save();
            defer fa.free(before);
            const stats = h.history.stats();
            const q = try h.query(1);
            defer q.deinit();
            const request: m.Apply = .{ .binding = h.binding(), .targets = &.{target(q.value)}, .patch = .{ .character = .{ .bold = true, .size = 1900 }, .paragraph = .{ .alignment = .CENTER } } };
            const start = failing.alloc_index;
            if (sample != 0) failing.fail_index = start + (sample - 1) * measured / @min(samples, measured);
            var failed = false;
            switch (mode) {
                .query => {
                    const selectors = [_]Query.Selector{.{ .section = 0, .paragraph = 1, .ranges = &ranges }};
                    if (h.service().query(fa, .{ .binding = h.binding(), .selectors = &selectors, .fields = null })) |bytes| fa.free(bytes) else |err| {
                        try std.testing.expectEqual(error.OutOfMemory, err);
                        failed = true;
                    }
                },
                .plan => {
                    if (h.service().normalizedPlan(fa, request)) |plan| fa.free(plan) else |err| {
                        try std.testing.expectEqual(error.OutOfMemory, err);
                        failed = true;
                    }
                },
                .transaction => {
                    _ = h.service().apply(fa, request) catch |err| blk: {
                        try std.testing.expectEqual(error.OutOfMemory, err);
                        failed = true;
                        break :blk false;
                    };
                },
            }
            if (sample == 0) measured = failing.alloc_index - start;
            failing.fail_index = std.math.maxInt(usize);
            if (failed) {
                failures += 1;
                try std.testing.expectEqualDeep(stats, h.history.stats());
                const after = try h.save();
                defer fa.free(after);
                try std.testing.expectEqualSlices(u8, before, after);
            }
        }
        try std.testing.expect(measured > 0);
        try std.testing.expect(failures > 0);
    }
}

// Frozen pre-optimization project implementation, used only for exact structural
// error/plan parity. This is not an independent file-format oracle.
const LegacyTree = @import("../body/tree.zig").Tree;
const LegacyVersion = @import("../version.zig").Version;
const LegacyPlan = @import("structure_plan.zig").Plan;
const LegacyInsertion = @import("structure_plan.zig").Insertion;
const legacyModel = @import("../../model/document.zig");
const legacyOwners = @import("paragraph_owner.zig");
fn frozenLegacyPlan(scratch: std.mem.Allocator, tree: LegacyTree, section: legacyModel.Section, version: LegacyVersion, allow_deletions: bool) !LegacyPlan {
    if (section.source_record_count != tree.nodes.len) return error.SourceBindingMismatch;
    var groups = try legacyOwners.inspectGroups(scratch, tree, version);
    defer groups.deinit(scratch);
    const additions = try scratch.alloc(u16, tree.nodes.len);
    errdefer scratch.free(additions);
    @memset(additions, 0);
    const removed_counts = try scratch.alloc(u16, tree.nodes.len);
    errdefer scratch.free(removed_counts);
    @memset(removed_counts, 0);
    var removals: std.ArrayList(u32) = .empty;
    errdefer removals.deinit(scratch);
    var insertions: std.ArrayList(LegacyInsertion) = .empty;
    errdefer insertions.deinit(scratch);
    var original_cursor: usize = 0;
    var previous: ?u32 = null;
    for (section.paragraphs, 0..) |p, index| {
        if (p.source_node) |node| {
            _ = try p.originalNode();
            if (node >= tree.nodes.len or node < original_cursor or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
            while (original_cursor < node) : (original_cursor += 1) {
                if (tree.nodes[original_cursor].record.value != .header) continue;
                if (!allow_deletions) return error.SourceBindingMismatch;
                try removals.append(scratch, @intCast(original_cursor));
            }
            while (original_cursor < tree.nodes.len and tree.nodes[original_cursor].record.value != .header) original_cursor += 1;
            if (node != original_cursor) return error.SourceBindingMismatch;
            original_cursor += 1;
            previous = node;
            continue;
        }
        const template = p.header_template orelse return error.MissingParagraphTemplate;
        if (previous == null or previous.? != template or template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
        const parent: ?usize = if (p.parent_node) |node| @as(usize, node) else null;
        if (tree.nodes[template].parent != parent) return error.SourceBindingMismatch;
        if (p.instance_id == 0) return error.InvalidParagraphInstanceId;
        for (section.paragraphs, 0..) |other, other_index| {
            if (other_index != index and other.instance_id == p.instance_id) return error.InvalidParagraphInstanceId;
        }
        try legacyOwners.validate(scratch, tree, template, version);
        const owner = try legacyOwners.logicalOwner(tree, groups, template);
        var last = true;
        for (tree.nodes[template + 1 ..], template + 1..) |node, ni| {
            if (node.record.value == .header and try legacyOwners.logicalOwner(tree, groups, ni) == owner) {
                last = false;
                break;
            }
        }
        if (index + 1 < section.paragraphs.len and section.paragraphs[index + 1].source_node == null and section.paragraphs[index + 1].header_template == template) last = false;
        if (allow_deletions) {
            last = true;
            for (section.paragraphs[index + 1 ..]) |following| {
                const next = following.source_node orelse following.header_template orelse return error.MissingParagraphTemplate;
                if (try legacyOwners.logicalOwner(tree, groups, next) == owner) {
                    last = false;
                    break;
                }
            }
        }
        if (owner) |list| {
            additions[list] = std.math.add(u16, additions[list], 1) catch return error.LimitExceeded;
            _ = try (try @import("paragraph_list_count.zig").read(tree, list)).adjusted(additions[list], 0);
        }
        try insertions.append(scratch, .{ .paragraph = index, .template_node = template, .owner_list = owner, .last_in_owner = last });
    }
    while (original_cursor < tree.nodes.len) : (original_cursor += 1) {
        if (tree.nodes[original_cursor].record.value != .header) continue;
        if (!allow_deletions) return error.SourceBindingMismatch;
        try removals.append(scratch, @intCast(original_cursor));
    }
    for (removals.items) |node| {
        const header = tree.nodes[node];
        if (header.record.value.header.extra.len != 0 or (header.record.value.header.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
        var retained_restart = false;
        for (section.paragraphs) |p| if (p.restart_control_source != null) {
            var links = try @import("../body/control_links.zig").Links.build(scratch, tree);
            defer links.deinit(scratch);
            const index = (try @import("page_restart_source.zig").forParagraph(links.items, p)).?;
            if (links.items[index].paragraph_node != node) continue;
            _ = try @import("current_restart_anchor.zig").resolve(scratch, tree, links.items, index, section.paragraphs);
            retained_restart = true;
        };
        // Do not silently delete containers, controls or unrepresented content.
        for (tree.nodes[node + 1 .. header.subtree_end]) |child| {
            if (retained_restart) continue; // Exact leaf scope was checked by resolver.
            if (child.parent != node) return error.UnsupportedStructuralControl;
            switch (child.record.framing.tag) {
                67 => {
                    const payload = child.record.framing.payload;
                    if (payload.len == 0) {
                        if (header.record.value.header.characterUnits() > 1) return error.UnsupportedMissingText;
                    } else try @import("plain_text_content.zig").validatePlain(payload);
                },
                68, 69 => {},
                70 => if (child.record.framing.payload.len != 0) return error.UnsupportedRangeSemantics,
                else => return error.UnsupportedStructuralControl,
            }
        }
        if (try legacyOwners.logicalOwner(tree, groups, node)) |list| {
            removed_counts[list] = std.math.add(u16, removed_counts[list], 1) catch return error.LimitExceeded;
        }
    }
    for (removed_counts, 0..) |count, node| {
        if (count == 0) continue;
        const total = try (try @import("paragraph_list_count.zig").read(tree, node)).adjusted(additions[node], 0);
        if (count >= total) return error.EmptyParagraphList;
    }
    const owned_insertions = try insertions.toOwnedSlice(scratch);
    errdefer scratch.free(owned_insertions);
    return .{ .insertions = owned_insertions, .list_additions = additions, .removals = try removals.toOwnedSlice(scratch), .list_removals = removed_counts };
}
