//! Hx insertion-only extension of the existing formatting normalizer. The source
//! writer must prove supported creation before a missing observation is admitted.
//! No unknown observation is rewritten, and no authority survives this call.
const std = @import("std");
const f = @import("../model/formatting_patch.zig");
const Backend = @import("formatting_projection.zig").Backend;
pub fn validate(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, state: *const @import("../model/formatting_binding.zig").State, history: *@import("editor_history.zig").History, binding: f.Binding, owner: f.Owner, ranges: []const f.Range, patch: f.Patch) !void {
    var budget: @import("../model/formatting_budget.zig").Budget = .{ .backing = a, .limit = f.limits.projection_bytes };
    var arena = std.heap.ArenaAllocator.init(budget.allocator());
    defer arena.deinit();
    const scratch = arena.allocator();
    var snapshot: Backend.Snapshot = .{ .allocator = session.allocator };
    defer snapshot.deinit();
    const backend: Backend = .{ .session = session, .allocator = a, .snapshot = &snapshot };
    var scope: @import("../model/formatting_scope.zig").Scope(Backend) = .{ .backend = backend, .allocator = scratch };
    _ = try scope.owner(owner);
    // Full intent and actual after spans are writer-validated before any read
    // exception. Missing strike color without enabled=true still fails here.
    try backend.preflight(scratch, owner, ranges, patch);
    const color_creation = patch.character.underline_color != null;
    const strike_creation = patch.character.strike_style != null and patch.character.strike_enabled == true;
    const strike_color_creation = patch.character.strike_color != null and patch.character.strike_enabled == true;
    var reduced = patch;
    const allow_color = color_creation and try missingCreation(&scope, owner, ranges, "character.underline.color", "MissingUnderlineColor");
    const allow_strike = strike_creation and try missingCreation(&scope, owner, ranges, "character.strike.style", "MissingStrikeStyle");
    const allow_strike_color = strike_color_creation and try missingCreation(&scope, owner, ranges, "character.strike.color", "MissingStrikeColor");
    if (allow_strike_color) reduced.character.strike_color = null;
    if (allow_color) reduced.character.underline_color = null;
    if (allow_strike) reduced.character.strike_style = null;
    const ref = try state.reference(a, owner);
    defer a.free(ref);
    const normalizer: @import("../wasm/formatting_service.zig").Service(.hwpx) = .{ .backend = backend, .lifetime = state, .history = history };
    const ops = try normalizer.normalizedPlan(a, .{ .binding = binding, .targets = &.{.{ .ref = ref, .ranges = ranges }}, .patch = reduced });
    a.free(ops);
}

fn missingCreation(scope: anytype, owner: f.Owner, ranges: []const f.Range, field: []const u8, reason: []const u8) !bool {
    const a = scope.allocator;
    const spans = try scope.spans(a, owner);
    var seen: std.AutoHashMapUnmanaged(u32, void) = .empty;
    var index: usize = 0;
    var missing = false;
    for (ranges) |range| {
        while (index < spans.len and spans[index].end <= range.startUnit) index += 1;
        var next = index;
        while (next < spans.len and spans[next].start < range.endUnit) : (next += 1) {
            const id = spans[next].resource orelse return error.InvalidCharacterShapeReference;
            if ((try seen.getOrPut(a, id)).found_existing) continue;
            const value = try scope.characterField(a, id, field);
            if (value.writable) continue;
            if (value.state != .unknown or !std.mem.eql(u8, value.reason orelse "", reason) or !std.mem.eql(u8, value.writeUnavailableReason orelse "", "MissingSourceField")) return error.FormattingTargetNotWritable;
            missing = true;
        }
    }
    if (missing) try scope.authorize(owner, ranges, field);
    return missing;
}
