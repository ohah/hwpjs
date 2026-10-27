//! Two real-format source tests; execution is reserved until full r4 terminates.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const Binding = @import("../model/formatting_binding.zig").State;
const m = @import("../model/formatting_patch.zig");
fn run(comptime format: Format) !void {
    const a = std.testing.allocator;
    const hwp5 = format == .hwp5;
    const path = if (hwp5) "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp" else "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx";
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
    defer a.free(original);
    const session = if (hwp5) try @import("../hwp5/edit/style_preservation.zig").Session.open(a, original) else try a.create(@import("../hwpx/editor_session.zig").Session);
    if (!hwp5) session.* = @import("../hwpx/editor_session.zig").open(a, original, .{}) catch |err| {
        a.destroy(session);
        return err;
    };
    defer if (hwp5) session.close() else {
        session.deinit();
        a.destroy(session);
    };
    const H = if (hwp5) @import("../hwp5/edit/editor_history.zig").History else @import("../hwpx/editor_history.zig").History;
    var history = if (hwp5) try H.initV2(a, session, .{}) else try H.initV2(session, .{});
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    defer lifetime.close();
    const token = try lifetime.session(a);
    defer a.free(token);
    const S = @import("../wasm/formatting_service.zig").Service(format);
    const service: S = .{ .backend = .{ .session = session, .allocator = a }, .lifetime = &lifetime, .history = &history };
    const paragraph = if (hwp5) @as(u32, 5) else @as(u32, 6);
    const ranges = [_]m.Range{.{ .startUnit = 0, .endUnit = 1 }};
    const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = paragraph, .ranges = &ranges }};
    const result = try service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &selectors, .fields = &.{ "character.bold", "paragraph.alignment" } });
    defer a.free(result);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, result, .{});
    defer parsed.deinit();
    const row = parsed.value.object.get("observations").?.object.get("perTarget").?.array.items[0];
    const observed = row.object.get("fields").?;
    const bold = observed.object.get("character.bold").?.object.get("value").?.bool;
    const alignment = observed.object.get("paragraph.alignment").?.object.get("value").?.string;
    const targets = [_]m.Target{.{ .ref = row.object.get("ref").?.string, .ranges = &ranges }};
    // Provided ranges are checked even without requested fields/character intent.
    const before_rejected_revision = history.revision();
    const bad_ranges = [_]m.Range{.{ .startUnit = 4294967294, .endUnit = 4294967295 }};
    const bad_selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = paragraph, .ranges = &bad_ranges }};
    try std.testing.expectError(error.InvalidTextPosition, service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &bad_selectors, .fields = &.{} }));
    try std.testing.expectError(error.InvalidTextPosition, service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &bad_selectors, .fields = &.{"paragraph.alignment"} }));
    const bad_targets = [_]m.Target{.{ .ref = row.object.get("ref").?.string, .ranges = &bad_ranges }};
    try std.testing.expectError(error.InvalidTextPosition, service.apply(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .targets = &bad_targets, .patch = .{ .paragraph = .{ .alignment = .LEFT } } }));
    try std.testing.expectEqual(before_rejected_revision, history.revision());
    const initial_revision = history.revision();
    const request: m.Apply = .{ .binding = .{ .session = token, .revision = initial_revision }, .targets = &targets, .patch = .{ .character = .{ .bold = !bold }, .paragraph = .{ .alignment = if (std.mem.eql(u8, alignment, "LEFT")) .RIGHT else .LEFT } } };
    // Exhaustive failures only in readonly planning; Session/History own their
    // existing allocator. This does not claim transaction/restore OOM coverage.
    const before_preflight = history.stats();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn check(allocator: std.mem.Allocator, current: *const S, input: m.Apply) !void {
            const plan = try current.normalizedPlan(allocator, input);
            defer allocator.free(plan);
        }
    }.check, .{ &service, request });
    try std.testing.expectEqualDeep(before_preflight, history.stats());
    const unchanged = if (hwp5) (try session.save(a, .{})).bytes else try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, original, unchanged);
    try std.testing.expect(try service.apply(a, request));
    try std.testing.expectEqual(initial_revision + 1, history.revision());
    try std.testing.expectError(error.StaleFormattingBinding, service.apply(a, request));
    var repeated = request;
    repeated.binding.revision = history.revision();
    try std.testing.expect(!try service.apply(a, repeated));
    try std.testing.expectEqual(initial_revision + 1, history.revision());
    var invalid = repeated;
    invalid.patch.paragraph.spacing = .{ .kind = 0, .value = 501 };
    try std.testing.expectError(error.InvalidParagraphSpacing, service.apply(a, invalid));
    try std.testing.expectEqual(initial_revision + 1, history.revision());
    const edited = if (hwp5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
    defer a.free(edited);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    const restored = if (hwp5) (try session.save(a, .{})).bytes else try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, original, restored);
    try std.testing.expect(try history.redo(session));
    const redone = if (hwp5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
test "HWP5 actual SSOT query char para one plan one undo source restore" {
    try run(.hwp5);
}
test "HWPX actual SSOT query char para one plan one undo source restore" {
    try run(.hwpx);
}
