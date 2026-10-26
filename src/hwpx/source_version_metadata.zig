//! Owned raw producer DTO from the existing package/version parser SSOT.
//! No classification, guessed defaults, Session fields, or header parsing here.
const std = @import("std");
const package = @import("package.zig");
pub const Metadata = struct {
    sourceVersion: ?package.Version = null,
    sourceVersionError: ?[]const u8 = null,
    pub fn deinit(self: *Metadata, a: std.mem.Allocator) void {
        if (self.sourceVersion) |*v| v.deinit(a);
        self.* = undefined;
    }
};
pub fn readDocument(a: std.mem.Allocator, doc: *const package.Document, options: package.VersionOptions) !Metadata {
    const v = doc.inspectVersion(a, options) catch |err| switch (err) {
        error.OutOfMemory, error.LimitExceeded => return err,
        else => return .{ .sourceVersionError = @errorName(err) },
    };
    return .{ .sourceVersion = v };
}
pub fn read(a: std.mem.Allocator, source: []const u8, options: package.VersionOptions) !Metadata {
    var doc = try package.inspectDocument(a, source, .{});
    defer doc.deinit(a);
    return readDocument(a, &doc, options);
}
