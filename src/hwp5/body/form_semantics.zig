const std = @import("std");
const Tree = @import("form_property_tree.zig").Tree;
const schema = @import("form_schema.zig");
const Kind = @import("form_object.zig").Kind;
const Resolution = @import("form_references.zig").Resolution;
pub const Flag = enum(u32) { missing, off, on, unrecognized };
pub const CharSource = enum(u32) { undetermined, explicit, surrounding };
pub const ActiveReference = enum(u32) { deferred, absent, valid, invalid };
pub const Choice = enum(u32) { not_applicable, deferred, unchecked, checked, indeterminate, invalid };
pub const Report = struct {
    follow_context: Flag,
    char_source: CharSource,
    active_reference: ActiveReference,
    tri_state: Flag,
    choice: Choice,
};
/// Explicit unsigned small decimal interpretation. Preserve noncanonical values
/// as unknown, not truthy/nonzero. Leading zeroes do not allocate or overflow.
fn small(bytes: []const u8, maximum: u8) ?u8 {
    if (bytes.len == 0 or bytes.len % 2 != 0) return null;
    var value: u8 = 0;
    for (0..bytes.len / 2) |i| {
        const c = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
        if (c < '0' or c > '9') return null;
        const next: u16 = @as(u16, value) * 10 + c - '0';
        if (next > maximum) return null;
        value = @intCast(next);
    }
    return value;
}
fn flag(tree: Tree, report: schema.Report, field: schema.Field) Flag {
    const p = report.get(tree, field) orelse return .missing;
    const n = small(p.value, 1) orelse return .unrecognized;
    return if (n == 0) .off else .on;
}
/// Same parsed Tree/schema and stored reference result. Official UI semantics,
/// applied to the explicit observed 0/1 wire model; no defaults or layout guesses.
pub fn inspectObserved(tree: Tree, report: schema.Report, kind: Kind, stored: Resolution) Report {
    const follow = flag(tree, report, .follow_context);
    const tri = flag(tree, report, .tri_state);
    const source: CharSource = switch (follow) {
        .off => .explicit,
        .on => .surrounding,
        else => .undetermined,
    };
    const active: ActiveReference = if (source != .explicit) .deferred else switch (stored) {
        .absent => .absent,
        .ordinal => .valid,
        .invalid => .invalid,
    };
    var choice: Choice = .not_applicable;
    if (kind == .check_box or kind == .radio_button) {
        choice = .deferred;
        if (report.get(tree, .value)) |p| {
            if (small(p.value, 2)) |n| choice = switch (n) {
                0 => .unchecked,
                1 => .checked,
                2 => switch (tri) {
                    .on => .indeterminate,
                    .off => .invalid,
                    else => .deferred,
                },
                else => unreachable,
            };
        }
    }
    return .{ .follow_context = follow, .char_source = source, .active_reference = active, .tri_state = tri, .choice = choice };
}
