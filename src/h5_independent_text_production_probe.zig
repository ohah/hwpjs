//! Constructor-only native production specialization probe; no file fixtures.
const std = @import("std");
const plain = @import("hwp5/edit/plain_text.zig");
const scope = @import("hwp5/edit/plain_text_source.zig");
comptime {
    if (@import("builtin").is_test) @compileError("use build-exe, not zig test");
    if (@hasField(plain.IndependentOptions, "work")) @compileError("production work option retained");
    if (plain.IndependentWork != void or scope.OrdinaryWork != void) @compileError("production measurement storage retained");
}
pub fn main() !void {
    const a = std.heap.page_allocator;
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const p = &document.sections[0].paragraphs[0];
    const ctx = try scope.OrdinaryContext.create(a, raw, version, 1);
    defer ctx.destroy();
    const at = p.declared_units - 1;
    std.debug.print("H5 production scoped begin at={d}\n", .{at});
    if (!try plain.applyIndependentScoped(a, ctx, raw, version, p, &.{.{ .start = at, .end = at, .text = "A" }}, 1, .{})) return error.ExpectedChange;
    std.debug.print("H5 production unscoped begin\n", .{});
    if (!try plain.applyIndependent(a, raw, version, p, &.{.{ .start = at, .end = at + 1, .text = "B" }}, 1, .{})) return error.ExpectedChange;
    std.debug.print("H5 production: Work=void; Options.work absent; scoped + unscoped applied\n", .{});
}
