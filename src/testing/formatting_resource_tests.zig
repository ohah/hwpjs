//! r5 source-only tests. No execution receipt until the parent authorizes Native.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const p = @import("../model/formatting_projection.zig");
const Budget = @import("../model/formatting_budget.zig").Budget;

test "formatting scratch limit differs from backing allocator OOM and releases ownership" {
    var budget: Budget = .{ .backing = std.testing.allocator, .limit = 32 };
    const a = budget.allocator();
    const bytes = try a.alloc(u8, 32);
    try std.testing.expectError(error.OutOfMemory, a.alloc(u8, 1));
    try std.testing.expectEqual(error.LimitExceeded, budget.classify(error.OutOfMemory));
    a.free(bytes);
    try std.testing.expectEqual(@as(usize, 0), budget.live);
    try std.testing.expectEqual(@as(usize, 32), budget.peak);
    var failing = std.testing.FailingAllocator.init(std.testing.allocator, .{ .fail_index = 0 });
    var underlying: Budget = .{ .backing = failing.allocator(), .limit = 32 };
    try std.testing.expectError(error.OutOfMemory, underlying.allocator().alloc(u8, 1));
    try std.testing.expect(!underlying.exceeded);
    try std.testing.expectEqual(error.OutOfMemory, underlying.classify(error.OutOfMemory));
}
const Counts = struct { owners: usize = 0, spans: usize = 0, fields: usize = 0, ranges: usize = 0, authorized: usize = 0 };
const Backend = struct {
    counts: *Counts,
    pub fn owner(self: @This(), value: m.Owner) !m.Owner {
        self.counts.owners += 1;
        return value;
    }
    pub fn spans(self: @This(), a: std.mem.Allocator, _: m.Owner) ![]p.Span {
        self.counts.spans += 1;
        const values = try a.alloc(p.Span, 1);
        values[0] = .{ .start = 0, .end = 2, .resource = 0 };
        return values;
    }
    pub fn characterField(self: @This(), _: std.mem.Allocator, _: u32, _: []const u8) !p.Observation {
        self.counts.fields += 1;
        return p.known(p.boolean(true), true, null, null);
    }
    pub fn paragraphField(_: @This(), _: std.mem.Allocator, _: m.Owner, _: []const u8) !p.Observation {
        return p.known(p.integer(0), true, null, null);
    }
    pub fn validateRange(self: @This(), _: m.Owner, _: m.Range) !void {
        self.counts.ranges += 1;
    }
    pub fn authorizeField(_: @This(), _: std.mem.Allocator, _: m.Owner, _: []const u8) !void {}
    pub fn authorizeOwner(self: @This(), _: m.Owner) !void {
        self.counts.authorized += 1;
    }
};
fn memoCase(a: std.mem.Allocator) !void {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    var counts: Counts = .{};
    var scope = @import("../model/formatting_scope.zig").Scope(Backend){ .backend = .{ .counts = &counts }, .allocator = arena.allocator() };
    const owner: m.Owner = .{ .section = 0, .paragraph = 0 };
    const ranges = [_]m.Range{.{ .startUnit = 0, .endUnit = 2 }};
    _ = try scope.owner(owner);
    _ = try scope.owner(owner);
    _ = try p.observe(arena.allocator(), &scope, owner, &ranges, "character.bold");
    _ = try p.observe(arena.allocator(), &scope, owner, &ranges, "character.bold");
    try std.testing.expectEqualDeep(Counts{ .owners = 1, .spans = 1, .fields = 1, .ranges = 1, .authorized = 1 }, counts);
}
test "formatting one call memo reads each shared source once and propagates every OOM" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, memoCase, .{});
}
test "formatting HWPX schema default unit is known writable but missing value stays unknown" {
    const B = @import("../hwpx/formatting_projection.zig").Backend;
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var shape: @import("../hwpx/paragraph_display_owned.zig").Shape = .{ .id = 9 };
    shape.margins[0] = .{ .value = -200, .unit = null };
    const margin = try B.paragraphFromShape(a, shape, "paragraph.margins.indent");
    try std.testing.expectEqual(.known, margin.state);
    try std.testing.expect(margin.writable);
    try std.testing.expectEqualStrings("HWPUNIT", margin.unit.?);
    shape.spacing_type = try a.dupe(u8, "FIXED");
    shape.spacing = .{ .value = 720, .unit = null };
    const spacing = try B.paragraphFromShape(a, shape, "paragraph.spacing.value");
    try std.testing.expectEqual(.known, spacing.state);
    try std.testing.expect(spacing.writable);
    try std.testing.expectEqualStrings("HWPUNIT", spacing.unit.?);
    shape.margins[0].?.value = null;
    const missing = try B.paragraphFromShape(a, shape, "paragraph.margins.indent");
    try std.testing.expectEqual(.unknown, missing.state);
    try std.testing.expect(!missing.writable);
}
fn unitWriterCase(a: std.mem.Allocator, tree: *const @import("../hwpx/xml_part_tree.zig").Tree) !void {
    try @import("../hwpx/formatting_preflight.zig").paragraph(a, tree, 1, 9, .{ .margins = .{ .indent = -720 }, .spacing = .{ .kind = 3, .value = 720 } }, 4096);
    const bytes = try @import("../hwpx/paragraph_resource_patch.zig").write(a, tree, 1, .{ .indent = -720 }, .{ .kind = 3, .value = 720 }, 4096);
    defer a.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "value='-720'") != null);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "unit=") == null);
}
test "formatting preflight accepts absent unit without inserting it at every allocation failure" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:paraPr id='9'><h:margin><c:intent value='0'/></h:margin><h:lineSpacing type='PERCENT' value='160'/></h:paraPr></h:head>";
    var tree = try @import("../hwpx/header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, unitWriterCase, .{&tree});
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "formatting preflight refuses hidden margin branch without mutating source" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><h:paraPr id='9'><h:margin><c:left value='720' unit='HWPUNIT'/></h:margin><p:switch><p:case p:required-namespace='urn:future'><h:margin><c:left value='360' unit='HWPUNIT'/></h:margin></p:case><p:default/></p:switch></h:paraPr></h:head>";
    var tree = try @import("../hwpx/header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedParagraphFormatBranch, @import("../hwpx/formatting_preflight.zig").paragraph(a, &tree, 1, 9, .{ .margins = .{ .left = 0 } }, 4096));
    try std.testing.expectError(error.UnsupportedParagraphFormatBranch, @import("../hwpx/formatting_preflight.zig").authorizeParagraph(a, &tree, 1, "paragraph.margins.left"));
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "formatting source writer refuses shared legacy decoration colors and absent strike slot" {
    const a = std.testing.allocator;
    var legacy: [79]u8 = @splat(0);
    std.mem.writeInt(u32, legacy[46..50], 2 << 2, .little);
    std.mem.writeInt(u32, legacy[56..60], 0x123456, .little);
    const original = legacy;
    try std.testing.expectError(error.ConflictingCharacterDecorationColors, @import("../hwp5/edit/character_property_payload.zig").write(a, &legacy, .{ .raw = 0x05000300 }, .{ .underline_color = 0, .strike_color = 1 }, 4096));
    try std.testing.expectEqualSlices(u8, &original, &legacy);
    var old: [68]u8 = @splat(0);
    const old_original = old;
    try std.testing.expectError(error.MissingCharacterStrikeColorField, @import("../hwp5/edit/character_property_payload.zig").write(a, &old, .{ .raw = 0x05000000 }, .{ .strike_color = 0 }, 4096));
    try std.testing.expectEqualSlices(u8, &old_original, &old);
}

test "formatting expanded plan budget refuses before source validation" {
    var ranges: [513]m.Range = undefined;
    for (&ranges, 0..) |*range, i| range.* = .{ .startUnit = @intCast(i), .endUnit = @intCast(i + 1) };
    var patch: m.Patch = .{ .character = .{ .bold = true } };
    for (&patch.fonts) |*font| font.* = .{ .name = "kept-all-seven-languages" };
    const targets = [_]m.Target{.{ .ref = "opaque", .ranges = &ranges }};
    const input: m.Apply = .{ .binding = .{ .session = "same", .revision = 0 }, .targets = &targets, .patch = patch };
    const Resolver = struct {
        pub fn checkBinding(_: @This(), _: m.Binding) !void {}
        pub fn resolve(_: @This(), _: []const u8) !m.Owner {
            return error.UnexpectedSourceRead;
        }
        pub fn validate(_: @This(), _: m.Owner, _: []const m.Range, _: m.Patch) !void {
            return error.UnexpectedSourceRead;
        }
    };
    try std.testing.expectError(error.LimitExceeded, m.plan(std.testing.allocator, input, Resolver{}));
    // A full rich request on one range keeps every group; no subset truncation.
    const one = [_]m.Target{.{ .ref = "opaque", .ranges = ranges[0..1] }};
    var rich = input;
    rich.targets = &one;
    rich.patch.paragraph = .{ .alignment = .LEFT, .margins = .{ .left = 0 }, .spacing = .{ .kind = 0, .value = 160 } };
    try std.testing.expectEqual(@as(usize, 11), try m.operationCount(rich));
}
