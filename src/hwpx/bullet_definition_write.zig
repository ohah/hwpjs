//! HWPX character-bullet resources. Official BulletType/ParaHeadType attributes;
//! source slices and the existing parked-document transaction own preservation.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
const child = @import("paragraph_display_children.zig").child;
const Placement = @import("paragraph_marker_placement.zig").Placement;
pub const Definition = @import("../model/paragraph_bullet_definition.zig").Definition;
pub const Request = @import("../model/paragraph_bullet_definition.zig").Request;
pub fn definition(marker: u32, p: Placement) Definition {
    return .{ .marker = marker, .alignment = @fromBackingInt(@intCast(@backingInt(p.alignment))), .useInstanceWidth = p.use_instance_width, .autoIndent = p.auto_indent, .widthAdjust = p.width_adjust, .textOffsetType = @fromBackingInt(@intCast(@backingInt(p.offset_type))), .textOffset = p.text_offset, .charShapeId = p.char_shape_id };
}
pub const validate = @import("../model/paragraph_bullet_definition.zig").validate;
pub const Header = struct { bytes: []u8, id: u32, changed: bool };
pub fn write(a: std.mem.Allocator, tree: *const Tree, request: Request, limit: usize) !Header {
    try validate(request.definition);
    if ((request.mode == .create) != (request.id == null)) return error.InvalidBulletDefinitionRequest;
    const root = for (tree.elements, 0..) |e, i| {
        if (e.parent == null and e.is(head, "head")) break i;
    } else return error.InvalidBulletHeaderOwner;
    const refs = (try child(a, tree, root, head, "refList")) orelse return error.InvalidBulletHeaderOwner;
    if (tree.elements[refs].parent != root) return error.InvalidBulletHeaderOwner;
    const group = try child(a, tree, refs, head, "bullets");
    const d = request.definition;
    if (d.charShapeId != 0xffffffff) {
        const chars = (try child(a, tree, refs, head, "charProperties")) orelse return error.InvalidCharacterShapeReference;
        if (tree.elements[chars].parent != refs) return error.UnsupportedBulletDefinitionOwner;
        var matches: usize = 0;
        var cur = tree.elements[chars].first_child;
        while (cur) |i| : (cur = tree.elements[i].next_sibling) {
            if (tree.elements[i].is(head, "charPr") and (try fields.optionalUnsigned(a, tree, i, "id", 64)) == d.charShapeId) matches += 1;
        }
        if (matches != 1) return error.InvalidCharacterShapeReference;
    }
    const inventory = try @import("bullet_definitions.zig").readTree(a, tree);
    defer a.free(inventory.declarations);
    var max: u32 = 0;
    for (inventory.declarations) |row| {
        const id = row.id orelse return error.InvalidBulletId;
        if (row.reason == .DuplicateBulletId) return error.DuplicateBulletId;
        max = @max(max, id);
    }
    const id = if (request.mode == .create) std.math.add(u32, max, 1) catch return error.LimitExceeded else request.id.?;
    if (request.mode == .create and inventory.declarations.len >= 4096) return error.LimitExceeded;
    if (group) |g| {
        if (tree.elements[g].parent != refs) return error.InvalidBulletHeaderOwner;
        const count = (try fields.optionalUnsigned(a, tree, g, "itemCnt", 64)) orelse return error.MissingBulletResourceCount;
        if (count != inventory.declarations.len) return error.BulletResourceCountMismatch;
    } else if (inventory.declarations.len != 0) return error.InvalidBulletHeaderOwner;
    // Numeric XML references are independent of the source attribute quote.
    if (!@import("../xml/characters.zig").valid(@intCast(d.marker))) return error.InvalidBulletMarker;
    const escaped = try std.fmt.allocPrint(a, "&#{d};", .{d.marker});
    defer a.free(escaped);
    if (request.mode == .update) {
        const row = for (inventory.declarations) |r| {
            if (r.id == id) break r;
        } else return error.UnknownBulletDefinition;
        if (!row.canApply) return error.UnsupportedBulletDeclaration;
        const node = for (tree.elements, 0..) |_, i| {
            if (@import("paragraph_heading_display.zig").isBulletDeclaration(tree, i) and (try fields.optionalUnsigned(a, tree, i, "id", 64)) == id) break i;
        } else return error.UnknownBulletDefinition;
        const ph = (try child(a, tree, node, head, "paraHead")) orelse return error.UnsupportedBulletDeclaration;
        if (tree.elements[ph].parent != node) return error.UnsupportedBulletDefinitionOwner;
        const old = (try @import("paragraph_marker_placement.zig").read(a, tree, ph)) orelse return error.UnobservedBulletGeometry;
        if (std.meta.eql(definition(row.marker.?, old), d)) return .{ .bytes = try a.dupe(u8, tree.source), .id = id, .changed = false };
        // Only explicit scalar attributes change. Opaque extensions/content survive.
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const scratch = arena.allocator();
        const names = [_][]const u8{ "char", "align", "useInstWidth", "autoIndent", "widthAdjust", "textOffsetType", "textOffset", "charPrIDRef" };
        const values = [_][]const u8{ escaped, @tagName(d.alignment), if (d.useInstanceWidth) "1" else "0", if (d.autoIndent) "1" else "0", try std.fmt.allocPrint(scratch, "{d}", .{d.widthAdjust}), @tagName(d.textOffsetType), try std.fmt.allocPrint(scratch, "{d}", .{d.textOffset}), try std.fmt.allocPrint(scratch, "{d}", .{d.charShapeId}) };
        var changes: [8]writer.Change = undefined;
        for (names, values, 0..) |name, value, i| {
            const raw = (try tree.attributeValue(scratch, if (i == 0) node else ph, "", name)) orelse return error.UnobservedBulletGeometry;
            const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
            changes[i] = .{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = try std.fmt.allocPrint(scratch, "{c}{s}{c}", .{ raw.raw[0], value, raw.raw[0] }) };
        }
        std.mem.sort(writer.Change, &changes, {}, less);
        return .{ .bytes = try writer.write(a, tree.source, &changes, limit), .id = id, .changed = true };
    }
    const fragment = try std.fmt.allocPrint(a, "<bw:bullet xmlns:bw=\"{s}\" id=\"{d}\" char=\"{s}\" useImage=\"0\"><bw:paraHead level=\"0\" align=\"{s}\" useInstWidth=\"{d}\" autoIndent=\"{d}\" widthAdjust=\"{d}\" textOffsetType=\"{s}\" textOffset=\"{d}\" numFormat=\"DIGIT\" charPrIDRef=\"{d}\" checkable=\"0\"/></bw:bullet>", .{ head, id, escaped, @tagName(d.alignment), @intFromBool(d.useInstanceWidth), @intFromBool(d.autoIndent), d.widthAdjust, @tagName(d.textOffsetType), d.textOffset, d.charShapeId });
    defer a.free(fragment);
    if (group) |g| {
        const raw = (try tree.attributeValue(a, g, "", "itemCnt")).?;
        const count = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw.raw[0], inventory.declarations.len + 1, raw.raw[0] });
        defer a.free(count);
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
        if (tree.elements[g].end_tag) |ending| {
            return .{ .bytes = try writer.write(a, tree.source, &.{ .{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = count }, .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = fragment } }, limit), .id = id, .changed = true };
        }
        // A genuinely empty self-closing resource group needs its own close tag.
        if (inventory.declarations.len != 0) return error.InvalidBulletHeaderOwner;
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, g);
        defer tag.deinit(a);
        const raw_tag = tree.source[tree.elements[g].start_tag.start..tree.elements[g].start_tag.end];
        const local_start = start - tree.elements[g].start_tag.start;
        const updated_tag = try writer.write(a, raw_tag, &.{.{ .start = local_start, .end = local_start + raw.raw.len, .text = "", .serialized_xml = count }}, limit);
        defer a.free(updated_tag);
        if (!std.mem.endsWith(u8, updated_tag, "/>")) return error.InvalidBulletHeaderOwner;
        const full = try std.fmt.allocPrint(a, "{s}>{s}</{s}>", .{ updated_tag[0 .. updated_tag.len - 2], fragment, tag.name.raw });
        defer a.free(full);
        return .{ .bytes = try writer.write(a, tree.source, &.{.{ .start = tree.elements[g].start_tag.start, .end = tree.elements[g].end, .text = "", .serialized_xml = full }}, limit), .id = id, .changed = true };
    }
    const paragraphs = (try child(a, tree, refs, head, "paraProperties")) orelse return error.InvalidBulletHeaderOwner;
    if (tree.elements[paragraphs].parent != refs) return error.UnsupportedBulletDefinitionOwner;
    const pos = tree.elements[paragraphs].start_tag.start;
    const full = try std.fmt.allocPrint(a, "<bw:bullets xmlns:bw=\"{s}\" itemCnt=\"1\">{s}</bw:bullets>", .{ head, fragment });
    defer a.free(full);
    return .{ .bytes = try writer.write(a, tree.source, &.{.{ .start = pos, .end = pos, .text = "", .serialized_xml = full }}, limit), .id = id, .changed = true };
}
fn less(_: void, l: writer.Change, r: writer.Change) bool {
    return l.start < r.start;
}

/// Compose against a saved current Session, then reopen through the existing
/// document edge. No live Session is modified during this preparation.
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: Request, options: @import("editor_session.zig").Options) !?@import("editor_session.zig").Session {
    var doc = try @import("package.zig").inspectDocument(a, before, .{});
    defer doc.deinit(a);
    var tree = try doc.readHeaderTree(a, .{ .tree = .{ .max_xml_bytes = options.max_xml_bytes } });
    defer tree.deinit(a);
    const result = try write(a, &tree, request, options.max_xml_bytes);
    defer a.free(result.bytes);
    if (!result.changed and !request.apply) return null;
    const entry = doc.manifest.items[tree.item_index].entry_index orelse return error.ExternalHeaderXml;
    const bytes = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = entry, .bytes = result.bytes }}, .{ .max_output_bytes = options.max_output_bytes });
    defer a.free(bytes);
    var candidate = try @import("editor_session.zig").open(a, bytes, options);
    errdefer candidate.deinit();
    if (request.apply) {
        const applied = try @import("paragraph_bullet_session.zig").apply(&candidate, request.section, request.paragraph, .{ .id = result.id });
        if (!result.changed and !applied) {
            candidate.deinit();
            return null;
        }
    }
    return candidate;
}

const sample: Definition = .{ .marker = 0x2605, .alignment = .RIGHT, .useInstanceWidth = false, .autoIndent = true, .widthAdjust = -50, .textOffsetType = .HWPUNIT, .textOffset = 750, .charShapeId = 0xffffffff };
test "bullet definition creates and updates without losing opaque ownership through every allocation failure" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:keep'><h:refList><h:paraProperties itemCnt='0'/></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(al: std.mem.Allocator, t: *const Tree) !void {
            const created = try write(al, t, .{ .mode = .create, .definition = sample }, 100000);
            defer al.free(created.bytes);
            try std.testing.expectEqual(@as(u32, 1), created.id);
            var current = try @import("header_tree.zig").parse(al, created.bytes, 0, .{});
            defer current.deinit(al);
            const noop = try write(al, &current, .{ .mode = .update, .id = 1, .definition = sample }, 100000);
            defer al.free(noop.bytes);
            try std.testing.expect(!noop.changed);
            var changed = sample;
            changed.marker = '&';
            changed.alignment = .CENTER;
            const updated = try write(al, &current, .{ .mode = .update, .id = 1, .definition = changed }, 100000);
            defer al.free(updated.bytes);
            var reopened = try @import("header_tree.zig").parse(al, updated.bytes, 0, .{});
            defer reopened.deinit(al);
            const dto = try @import("bullet_definitions.zig").readTree(al, &reopened);
            defer al.free(dto.declarations);
            try std.testing.expectEqualDeep(changed, dto.declarations[0].definition.?);
            try std.testing.expect(std.mem.indexOf(u8, updated.bytes, "<h:paraProperties itemCnt='0'/>") != null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(xml, tree.source);
    var bad = sample;
    bad.charShapeId = 13;
    try std.testing.expectError(error.InvalidCharacterShapeReference, write(a, &tree, .{ .mode = .create, .definition = bad }, 100000));
    bad = sample;
    bad.marker = 0xd800;
    try std.testing.expectError(error.InvalidBulletMarker, write(a, &tree, .{ .mode = .create, .definition = bad }, 100000));
}

test "bullet definition parked history is atomic across budget failure undo redo and current intents" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var s = try @import("editor_session.zig").open(a, bytes, .{});
    defer s.deinit();
    const histories = @import("editor_history.zig");
    s.history_delta_managed = true;
    var h = try histories.History.initV2(&s, .{});
    defer h.deinit();
    const r: Request = .{ .mode = .create, .definition = sample, .apply = true, .section = 0, .paragraph = 2 };
    const cmd: histories.Command = .{ .kind = .bullet_definition, .bullet_definition = &r, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
    try std.testing.expect(try h.apply(&s, cmd));
    const saved = try s.save();
    defer a.free(saved);
    const dto = try @import("bullet_definitions.zig").read(a, &s);
    defer a.free(dto.declarations);
    try std.testing.expectEqualDeep(sample, dto.declarations[0].definition.?);
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    const old_limit = h.owned.?.stack.policy.max_checkpoint_bytes;
    h.owned.?.stack.policy.max_checkpoint_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, h.apply(&s, cmd));
    h.owned.?.stack.policy.max_checkpoint_bytes = old_limit;
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "bullet definition source update preserves extensions and empty resource group attributes" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:x'><h:refList><h:bullets itemCnt='0' x:opaque='keep'/><h:paraProperties/></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    const created = try write(a, &tree, .{ .mode = .create, .definition = sample }, 100000);
    defer a.free(created.bytes);
    try std.testing.expect(std.mem.indexOf(u8, created.bytes, "x:opaque='keep'") != null);
    // An extension inside a declaration remains byte-preserved on update.
    const point = std.mem.indexOf(u8, created.bytes, "</bw:bullet>").?;
    const extended = try writer.write(a, created.bytes, &.{.{ .start = point, .end = point, .text = "", .serialized_xml = "<x:keep>opaque<!--same--></x:keep>" }}, 100000);
    defer a.free(extended);
    var current = try @import("header_tree.zig").parse(a, extended, 0, .{});
    defer current.deinit(a);
    var d = sample;
    d.marker = 0x25c6;
    const updated = try write(a, &current, .{ .mode = .update, .id = 1, .definition = d }, 100000);
    defer a.free(updated.bytes);
    try std.testing.expect(std.mem.indexOf(u8, updated.bytes, "<x:keep>opaque<!--same--></x:keep>") != null);
}

test "bullet definition transaction OOM before and late preparation preserves bytes history and redo" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    // Probe command allocation count, then inject early, middle and final
    // failures using the same allocator and Session identity. Not a full sweep.
    var command_allocations: usize = 0;
    const indexes = [_]?usize{ null, 0, 1, 32, 128, 512, 2048, std.math.maxInt(usize), std.math.maxInt(usize) - 1 };
    for (indexes) |which| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const al = failing.allocator();
        var s = try @import("editor_session.zig").open(al, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        const histories = @import("editor_history.zig");
        var h = try histories.History.initV2(&s, .{});
        defer h.deinit();
        const r: Request = .{ .mode = .create, .definition = sample, .apply = true, .section = 0, .paragraph = 2 };
        const cmd: histories.Command = .{ .kind = .bullet_definition, .bullet_definition = &r, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
        try std.testing.expect(try h.apply(&s, cmd));
        const applied = try s.save();
        defer al.free(applied);
        try std.testing.expect(try h.undo(&s));
        const allocation_start = failing.alloc_index;
        if (which) |i| failing.fail_index = allocation_start + (if (i >= std.math.maxInt(usize) - 1) command_allocations - (std.math.maxInt(usize) - i) - 1 else i);
        const changed = h.apply(&s, cmd) catch |err| blk: {
            if (err != error.OutOfMemory) return err;
            break :blk false;
        };
        if (which == null) command_allocations = failing.alloc_index - allocation_start;
        failing.fail_index = std.math.maxInt(usize);
        if (which) |i| {
            if (i < command_allocations or i >= std.math.maxInt(usize) - 1) {
                try std.testing.expect(failing.has_induced_failure);
                try std.testing.expect(!changed);
                const restored = try s.save();
                defer al.free(restored);
                try std.testing.expectEqualSlices(u8, bytes, restored);
                try std.testing.expect(try h.redo(&s));
                const redone = try s.save();
                defer al.free(redone);
                try std.testing.expectEqualSlices(u8, applied, redone);
            }
        }
    }
    std.debug.print("bullet definition transaction allocations: {d}; selected OOM boundaries verified\n", .{command_allocations});
}

test "bullet definition rejects ambiguous IDs counts unsupported declarations and missing geometry" {
    const a = std.testing.allocator;
    const cases = [_]struct { body: []const u8, count: u32, expected: anyerror }{
        .{ .body = "<h:bullet id='7' char='X' useImage='0'><h:paraHead checkable='0'/></h:bullet>", .count = 1, .expected = error.UnobservedBulletGeometry },
        .{ .body = "<h:bullet id='7' char='X' useImage='0'><h:paraHead checkable='1'/></h:bullet>", .count = 1, .expected = error.UnsupportedBulletDeclaration },
        .{ .body = "<h:bullet id='7' char='X' useImage='0'><p:switch xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:default><h:paraHead checkable='0' align='LEFT' useInstWidth='1' autoIndent='1' widthAdjust='0' textOffsetType='PERCENT' textOffset='50' charPrIDRef='4294967295'/></p:default></p:switch></h:bullet>", .count = 1, .expected = error.UnsupportedBulletDefinitionOwner },
        .{ .body = "<h:bullet id='7' char='X' useImage='0'><h:paraHead checkable='0'/></h:bullet><h:bullet id='7' char='Y' useImage='0'><h:paraHead checkable='0'/></h:bullet>", .count = 2, .expected = error.DuplicateBulletId },
        .{ .body = "<h:bullet id='7' char='X' useImage='0'><h:paraHead checkable='0'/></h:bullet>", .count = 0, .expected = error.BulletResourceCountMismatch },
    };
    for (cases) |case| {
        const xml = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:bullets itemCnt='{d}'>{s}</h:bullets><h:paraProperties/></h:refList></h:head>", .{ case.count, case.body });
        defer a.free(xml);
        var t = try @import("header_tree.zig").parse(a, xml, 0, .{});
        defer t.deinit(a);
        try std.testing.expectError(case.expected, write(a, &t, .{ .mode = .update, .id = 7, .definition = sample }, 100000));
        try std.testing.expectEqualStrings(xml, t.source);
    }
}
