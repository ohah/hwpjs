//! Atomic drafts over native Document intents; no source/package rebasing.
const std = @import("std");
const model = @import("../../model/document.zig");
const dto = @import("../../model/paragraph_bullet_definition.zig");
const Bullet = @import("../../model/formatting_patch.zig").Bullet;
const Version = @import("../version.zig").Version;
const declarations = @import("bullet_definitions.zig");
pub fn authorize(document: *const model.Document, section: usize, paragraph: usize) !void {
    if (section >= document.sections.len) return error.InvalidSection;
    if (paragraph >= document.sections[section].paragraphs.len) return error.InvalidParagraph;
    const p = document.sections[section].paragraphs[paragraph];
    if (p.parent_node != null or (p.source_node == null and p.header_template == null)) return error.UnsupportedBulletOwner;
}
pub fn reference(a: std.mem.Allocator, bytes: []const u8, version: Version, shape: u16) !Bullet {
    const current = try @import("paragraph_bullet_payload.zig").read(bytes, version, shape);
    if (current.id) |id| try eligible(a, bytes, version, id);
    return current;
}
pub fn eligible(a: std.mem.Allocator, bytes: []const u8, version: Version, id: u32) !void {
    const info = try declarations.inspect(a, bytes, version);
    defer info.deinit(a);
    if (id == 0 or id > info.count) return error.InvalidBulletId;
    if (!info.declarations[id - 1].canApply) return error.UnsupportedBulletDeclaration;
}
pub fn applyReference(a: std.mem.Allocator, document: *model.Document, original: []const u8, version: Version, para_count: usize, char_count: usize, section: usize, paragraph: usize, value: Bullet, limit: usize) !void {
    try authorize(document, section, paragraph);
    const current = try @import("resource_docinfo.zig").write(a, original, version, document, para_count, char_count, limit);
    defer a.free(current);
    _ = try reference(a, current, version, document.sections[section].paragraphs[paragraph].para_shape_id);
    if (value.id) |id| try eligible(a, current, version, id);
    try @import("paragraph_alignment_apply.zig").applyWithBullet(a, document, original, version, para_count, section, paragraph, null, .{}, null, .{}, .{}, value, limit);
}
pub fn definition(a: std.mem.Allocator, document: *model.Document, original: []const u8, version: Version, para_count: usize, char_count: usize, request: dto.Request, limit: usize) !void {
    try declarations.validate(request.definition);
    if ((request.mode == .create) != (request.id == null)) return error.InvalidBulletDefinitionRequest;
    const current = try @import("resource_docinfo.zig").write(a, original, version, document, para_count, char_count, limit);
    defer a.free(current);
    const inventory = try declarations.inspect(a, current, version);
    defer inventory.deinit(a);
    if (request.definition.charShapeId != 0xffffffff and request.definition.charShapeId >= inventory.char_count) return error.InvalidCharacterShapeReference;
    const id: u16 = if (request.mode == .create) blk: {
        if (inventory.count >= 4096) return error.LimitExceeded;
        break :blk @intCast(inventory.count + 1);
    } else blk: {
        const identity = request.id.?;
        if (identity == 0 or identity > inventory.count) return error.InvalidBulletId;
        if (inventory.declarations[identity - 1].definition == null) return error.UnsupportedBulletDeclaration;
        if (std.meta.eql(inventory.declarations[identity - 1].definition.?, request.definition)) {
            if (request.apply) try applyReference(a, document, original, version, para_count, char_count, request.section, request.paragraph, .{ .id = identity }, limit);
            return;
        }
        break :blk @intCast(identity);
    };
    var found: ?usize = null;
    for (document.bullet_resources, 0..) |v, i| if (v.id == id) {
        found = i;
        break;
    };
    const bullets = try a.alloc(dto.ResourceIntent, document.bullet_resources.len + @as(usize, @intFromBool(found == null)));
    defer a.free(bullets);
    @memcpy(bullets[0..document.bullet_resources.len], document.bullet_resources);
    const position = found orelse document.bullet_resources.len;
    bullets[position] = .{ .id = id, .created = if (found) |i| document.bullet_resources[i].created else request.mode == .create, .definition = request.definition };
    // Stage only the referenced paragraph array and paragraph-resource vector;
    // text/source and unrelated sections remain borrowed until the no-fail swap.
    var draft = document.*;
    draft.bullet_resources = bullets;
    draft.paragraph_resources = try a.dupe(model.ParagraphResourceIntent, document.paragraph_resources);
    defer a.free(draft.paragraph_resources);
    const sections = try a.dupe(model.Section, document.sections);
    defer a.free(sections);
    draft.sections = sections;
    var paragraphs: ?[]model.Paragraph = null;
    defer if (paragraphs) |p| a.free(p);
    if (request.apply) {
        try authorize(document, request.section, request.paragraph);
        paragraphs = try a.dupe(model.Paragraph, document.sections[request.section].paragraphs);
        draft.sections[request.section].paragraphs = paragraphs.?;
        try applyReference(a, &draft, original, version, para_count, char_count, request.section, request.paragraph, .{ .id = id }, limit);
    }
    const verified = try @import("resource_docinfo.zig").write(a, original, version, &draft, para_count, char_count, limit);
    defer a.free(verified);
    // Transfer fresh owned vectors only after all fallible preparation completed.
    const owned_bullets = try a.dupe(dto.ResourceIntent, bullets);
    a.free(document.bullet_resources);
    document.bullet_resources = owned_bullets;
    std.mem.swap([]model.ParagraphResourceIntent, &document.paragraph_resources, &draft.paragraph_resources);
    if (request.apply) document.sections[request.section].paragraphs[request.paragraph].para_shape_id = draft.sections[request.section].paragraphs[request.paragraph].para_shape_id;
}

test "HWP5 bullet definitions and reference share one history with generated paragraph support" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwp", a, .limited(4000000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try @import("editor_history.zig").History.initV2(a, s, .{});
    defer h.deinit();
    const d: dto.Definition = .{ .marker = 0x2605, .alignment = .RIGHT, .useInstanceWidth = false, .autoIndent = true, .widthAdjust = -50, .textOffsetType = .HWPUNIT, .textOffset = 750, .charShapeId = 0xffffffff };
    // Generated continuation remains owned by the same Session source template.
    try std.testing.expect(try h.apply(s, .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } }));
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    const r: dto.Request = .{ .mode = .create, .definition = d, .apply = true, .section = 0, .paragraph = 2 };
    const revision = h.revision();
    try std.testing.expect(try h.apply(s, .{ .edit_bullet_definition = r }));
    try std.testing.expectEqual(revision + 1, h.revision());
    const snapshot = try s.bulletDefinitions(a);
    defer a.free(snapshot.declarations);
    try std.testing.expectEqualDeep(d, snapshot.declarations[snapshot.declarations.len - 1].definition.?);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try h.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, undone.bytes);
    try std.testing.expect(try h.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const again = try reopened.bulletDefinitions(a);
    defer a.free(again.declarations);
    try std.testing.expectEqualDeep(d, again.declarations[again.declarations.len - 1].definition.?);
}

test "HWP5 bullet history OOM and checkpoint budget keep current bytes and redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwp", a, .limited(4000000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    const d: dto.Definition = .{ .marker = 0x2605, .alignment = .RIGHT, .useInstanceWidth = false, .autoIndent = true, .widthAdjust = -50, .textOffsetType = .HWPUNIT, .textOffset = 750, .charShapeId = 0xffffffff };
    const command: edit.Command = .{ .edit_bullet_definition = .{ .mode = .create, .definition = d, .apply = true, .section = 0, .paragraph = 4 } };
    var count: usize = 0;
    for ([_]?usize{ null, 0, 1, 4, 16, 32, 64, std.math.maxInt(usize), std.math.maxInt(usize) - 1 }) |index| {
        var fault = std.testing.FailingAllocator.init(a, .{});
        const al = fault.allocator();
        const s = try edit.Session.open(al, input);
        defer s.close();
        s.enableHistoryDelta();
        var h = try @import("editor_history.zig").History.initV2(al, s, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(s, command));
        const saved = try s.save(al, .{ .allow_stale_layout = true });
        defer al.free(saved.bytes);
        try std.testing.expect(try h.undo(s));
        const start = fault.alloc_index;
        if (index) |i| fault.fail_index = start + (if (i >= std.math.maxInt(usize) - 1) count - (std.math.maxInt(usize) - i) - 1 else i);
        const result = h.apply(s, command) catch |err| blk: {
            if (err != error.OutOfMemory) return err;
            break :blk false;
        };
        if (index == null) count = fault.alloc_index - start;
        fault.fail_index = std.math.maxInt(usize);
        if (index) |i| {
            if (i < count or i >= std.math.maxInt(usize) - 1) {
                try std.testing.expect(fault.has_induced_failure);
                try std.testing.expect(!result);
                try std.testing.expectEqual(@as(u32, 0), h.revision());
                const unchanged = try s.save(al, .{ .allow_stale_layout = true });
                defer al.free(unchanged.bytes);
                try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
                try std.testing.expect(try h.redo(s));
                const redone = try s.save(al, .{ .allow_stale_layout = true });
                defer al.free(redone.bytes);
                try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
            }
        }
    }
    std.debug.print("HWP5 bullet transaction allocations {d}, selected OOM boundaries verified\n", .{count});
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try @import("editor_history.zig").History.initV2(a, s, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(s, command));
    try std.testing.expect(try h.undo(s));
    const old_limit = h.owned.?.stack.policy.max_checkpoint_bytes;
    h.owned.?.stack.policy.max_checkpoint_bytes = @intCast(try s.checkpointSize(std.math.maxInt(usize)));
    try std.testing.expectError(error.LimitExceeded, h.apply(s, command));
    h.owned.?.stack.policy.max_checkpoint_bytes = old_limit;
    try std.testing.expect(try h.redo(s));
}
