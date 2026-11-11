const std = @import("std");
pub const Setting = @import("page_settings_snapshot.zig").Setting;
pub const Values = @import("../../hwpx/page_settings_edit_types.zig").Values;
pub const Target = struct { section: usize, expected: Setting };
pub const Request = struct { binding: @import("../../hwpx/page_settings_edit_types.zig").Binding, scope: enum { section, document }, targets: []const Target, values: Values };
pub fn equal(s: Setting, v: Values) bool {
    const orientation: @import("../body/page_def.zig").Orientation = if (v.orientation == .widely) .narrowly else .widely;
    const binding: @import("../body/page_def.zig").Binding = switch (v.gutter_type) {
        .left_only => .one_side,
        .left_right => .facing,
        .top_bottom => .top,
    };
    return s.width == v.width and s.height == v.height and s.orientation == orientation and s.binding == binding and s.left == v.margin.left and s.right == v.margin.right and s.top == v.margin.top and s.bottom == v.margin.bottom and s.header == v.margin.header and s.footer == v.margin.footer and s.gutter == v.margin.gutter;
}
pub fn validate(a: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, r: Request) !bool {
    try @import("../../hwpx/page_settings_edit_types.zig").validate(r.values);
    const count = s.sectionCount();
    if (count > 512 or r.targets.len == 0 or r.targets.len > 512 or (r.scope == .section and r.targets.len != 1) or (r.scope == .document and r.targets.len != count)) return error.InvalidPageSettingsTargets;
    const seen = try a.alloc(bool, count);
    defer a.free(seen);
    @memset(seen, false);
    var changed = false;
    for (r.targets) |target| {
        if (target.section >= count or seen[target.section]) return error.InvalidPageSettingsTargets;
        seen[target.section] = true;
        const current = try s.pageSettings(a, target.section);
        if (!std.meta.eql(current, target.expected)) return error.StalePageSettingsSnapshot;
        if (!equal(current, r.values)) changed = true;
    }
    return changed;
}
