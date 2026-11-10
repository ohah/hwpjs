//! Constructor-only non-test specialization: no diagnostic state in production.
const std = @import("std");
const policy = @import("hwp5/edit/text_source_policy.zig");
comptime {
    if (@import("builtin").is_test) @compileError("build-exe required");
    if (policy.Work != void) @compileError("production policy counters retained");
}
pub fn main() !void {
    const a = std.heap.page_allocator;
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var scope: ?*policy.UnselectedContext = null;
    defer if (scope) |p| p.destroy();
    const first = try session.prepareIndependentSourceContextScoped(0, &scope);
    defer first.destroy();
    try session.validateIndependentTextTarget(first, 0, 0, 16, &.{});
    const second = try session.prepareIndependentSourceContextScoped(0, &scope);
    defer second.destroy();
    try session.validateIndependentTextTarget(second, 0, 0, 16, &.{});
    std.debug.print("H5 policy request production Work=void; scoped Session source+target validation passed\n", .{});
}
