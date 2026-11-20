//! Generation-bound read locators. No setter/mutation authority is issued.
const std = @import("std");
const lifetime = @import("formatting_binding.zig");
const binding = @import("document_text_binding.zig");
const Owner = @import("formatting_patch.zig").Owner;
pub fn reference(a: std.mem.Allocator, state: lifetime.State, revision: ?u32, owner: Owner, generation: u64) ![]u8 {
    const prior = try binding.reference(a, state, revision, owner);
    defer a.free(prior);
    return std.fmt.allocPrint(a, "d2-{s}:g{d}", .{ prior[3..], generation });
}
pub fn resolve(state: lifetime.State, revision: ?u32, generation: u64, ref: []const u8) !Owner {
    if (ref.len > 256 or !std.mem.startsWith(u8, ref, "d2-p")) return error.InvalidDocumentTextReference;
    const marker = std.mem.indexOf(u8, ref, ":g") orelse return error.InvalidDocumentTextReference;
    const observed = try lifetime.decimal(ref[marker + 2 ..]);
    if (observed != generation) return error.StaleDocumentTextReadBinding;
    var buffer: [256]u8 = undefined;
    const prior = try std.fmt.bufPrint(&buffer, "d1-{s}", .{ref[3..marker]});
    return binding.resolve(state, revision, prior);
}
