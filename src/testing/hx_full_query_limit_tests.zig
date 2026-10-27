//! 실행 전 회귀 후보. 기존 한도를 유지한 실제 서식 세 명령과 합본 조회를 검증한다.
const std = @import("std");
const a = std.testing.allocator;
const m = @import("../model/formatting_patch.zig");
const Binding = @import("../model/formatting_binding.zig").State;
const Service = @import("../wasm/formatting_service.zig").Service(.hwpx);
const fields = [_][]const u8{ "character.size", "character.bold", "character.italic", "character.shadow", "character.border", "character.background", "paragraph.alignment", "paragraph.grid", "paragraph.borderConnect", "paragraph.border", "paragraph.background", "reset.style" };
fn query(service: *const Service, token: []const u8, names: []const []const u8) ![]u8 {
    const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 2, .ranges = &.{.{ .startUnit = 0, .endUnit = 1 }} }};
    return service.query(a, .{ .binding = .{ .session = token, .revision = service.history.?.revision() }, .selectors = &selectors, .fields = names });
}
fn apply(service: *const Service, token: []const u8, paragraph: usize, patch: m.Patch) !void {
    const ref = try service.lifetime.reference(a, .{ .section = 0, .paragraph = paragraph });
    defer a.free(ref);
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = token, .revision = service.history.?.revision() }, .targets = &.{.{ .ref = ref, .ranges = &.{.{ .startUnit = 0, .endUnit = 1 }} }}, .patch = patch }));
}
fn equalJson(left: std.json.Value, right: std.json.Value) !void {
    const l = try std.json.Stringify.valueAlloc(a, left, .{});
    defer a.free(l);
    const r = try std.json.Stringify.valueAlloc(a, right, .{});
    defer a.free(r);
    try std.testing.expectEqualStrings(l, r);
}
test "HX 합본 열두 필드: 서식 세 명령 뒤 기존 예산으로 단독 값 동치와 읽기 전용 보존" {
    const source = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(source);
    var session = try @import("../hwpx/editor_session.zig").open(a, source, .{});
    defer session.deinit();
    var history = try @import("../hwpx/editor_history.zig").History.initV2(&session, .{});
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    defer lifetime.close();
    const token = try lifetime.session(a);
    defer a.free(token);
    const service: Service = .{ .backend = .{ .session = &session, .allocator = a }, .lifetime = &lifetime, .history = &history };
    const patch: m.Patch = .{ .paragraph = .{ .border_fill = .{ .border = .{ .edges = @splat(.{ .style = .SOLID, .width_hundredth_mm = 50, .color = 0x5522bb }) }, .background = .none }, .flags = .{ .border_connect = false } } };
    try apply(&service, token, 1, patch);
    try apply(&service, token, 2, patch);
    try apply(&service, token, 1, .{ .paragraph = .{ .flags = .{ .border_connect = true } } });
    try std.testing.expectEqual(@as(?u32, 3), history.revision());
    const before = try session.save();
    defer a.free(before);
    const before_stats = history.stats();
    const full = try query(&service, token, &fields);
    defer a.free(full);
    try std.testing.expect(full.len <= m.limits.reply_bytes);
    // query는 요청 arena와 Snapshot을 이미 해제했다. 이후 열두 요청 뒤에도 owned 결과가 유효해야 한다.
    const parsed = try std.json.parseFromSlice(std.json.Value, a, full, .{});
    defer parsed.deinit();
    const observations = parsed.value.object.get("observations").?;
    const aggregate = observations.object.get("aggregate").?;
    const per_target = observations.object.get("perTarget").?.array.items[0].object.get("fields").?;
    try std.testing.expectEqual(fields.len, aggregate.object.count());
    for (fields) |field| {
        const single = try query(&service, token, &.{field});
        defer a.free(single);
        const one = try std.json.parseFromSlice(std.json.Value, a, single, .{});
        defer one.deinit();
        const one_obs = one.value.object.get("observations").?;
        try equalJson(aggregate.object.get(field).?, one_obs.object.get("aggregate").?.object.get(field).?);
        try equalJson(per_target.object.get(field).?, one_obs.object.get("perTarget").?.array.items[0].object.get("fields").?.object.get(field).?);
    }
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualDeep(before_stats, history.stats());
    const reparsed = try std.json.parseFromSlice(std.json.Value, a, full, .{});
    defer reparsed.deinit();
    try equalJson(parsed.value, reparsed.value);
}
test "HX 합본 한도: 실제 예산 초과와 요청 바이트 초과는 계속 거부" {
    const Budget = @import("../model/formatting_budget.zig").Budget;
    var budget: Budget = .{ .backing = a, .limit = m.limits.projection_bytes };
    try std.testing.expectError(error.OutOfMemory, budget.allocator().alloc(u8, m.limits.projection_bytes + 1));
    try std.testing.expectEqual(error.LimitExceeded, budget.classify(error.OutOfMemory));
    try std.testing.expectEqual(@as(usize, 0), budget.live);
    const oversized = try a.alloc(u8, m.limits.request_bytes + 1);
    defer a.free(oversized);
    @memset(oversized, ' ');
    try std.testing.expectError(error.LimitExceeded, @import("../wasm/formatting_query_request.zig").decode(a, oversized, &fields));
}
