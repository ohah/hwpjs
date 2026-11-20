//! Read-only source namespace. It is never accepted by an editor's read/writer refs.
const std = @import("std");
const Lifetime = @import("formatting_binding.zig").State;
pub const Domain = enum { editor, readonly_hwp5 };
pub fn session(a: std.mem.Allocator, issuer: Lifetime, domain: Domain) ![]u8 {
    const value = try issuer.session(a);
    if (domain == .editor) return value;
    defer a.free(value);
    return std.fmt.allocPrint(a, "v-{s}", .{value});
}
pub fn reference(a: std.mem.Allocator, issuer: Lifetime, revision: ?u32, owner: @import("formatting_patch.zig").Owner, generation: u64, domain: Domain) ![]u8 {
    const value = try @import("document_text_read_reference.zig").reference(a, issuer, revision, owner, generation);
    if (domain == .editor) return value;
    defer a.free(value);
    if (revision != null) return error.InvalidDocumentTextRevision;
    return std.fmt.allocPrint(a, "v-{s}", .{value});
}
pub fn resolve(issuer: Lifetime, revision: ?u32, generation: u64, ref: []const u8, domain: Domain) !@import("formatting_patch.zig").Owner {
    const value = if (domain == .readonly_hwp5) value: {
        if (revision != null or !std.mem.startsWith(u8, ref, "v-")) return error.InvalidDocumentTextReference;
        break :value ref[2..];
    } else ref;
    return @import("document_text_read_reference.zig").resolve(issuer, revision, generation, value);
}
