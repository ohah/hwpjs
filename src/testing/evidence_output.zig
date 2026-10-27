//! Explicit test-only evidence sink. No environment variable means no filesystem IO.
const std = @import("std");
pub const Sink = struct {
    io: std.Io,
    directory: std.Io.Dir,

    pub fn fromEnviron(a: std.mem.Allocator, io: std.Io, environ: std.process.Environ, comptime name: []const u8) !?Sink {
        const path = std.process.Environ.getAlloc(environ, a, name) catch |err| switch (err) {
            error.EnvironmentVariableMissing => return null,
            else => return err,
        };
        defer a.free(path);
        return try openAbsolute(io, path);
    }
    /// Null is an explicitly disabled sink and performs no filesystem operation.
    pub fn fromDirectory(io: std.Io, path: ?[]const u8) !?Sink {
        return if (path) |value| try openAbsolute(io, value) else null;
    }
    pub fn openAbsolute(io: std.Io, path: []const u8) !Sink {
        if (path.len == 0 or !std.fs.path.isAbsolute(path) or std.mem.indexOfScalar(u8, path, 0) != null or
            std.mem.indexOfScalar(u8, path, '\\') != null or
            std.mem.indexOf(u8, path, "title-column-roundtrip") != null or
            std.mem.indexOf(u8, path, "hwpers_test4_complex_table") != null or
            std.mem.indexOf(u8, path, "/legacy/hwpers") != null) return error.InvalidEvidenceDirectory;
        var components = std.mem.splitScalar(u8, path, '/');
        while (components.next()) |part| if (std.mem.eql(u8, part, "..")) return error.InvalidEvidenceDirectory;
        return .{ .io = io, .directory = try std.Io.Dir.openDirAbsolute(io, path, .{}) };
    }
    pub fn deinit(self: *Sink) void {
        self.directory.close(self.io);
        self.* = undefined;
    }
    fn validateLeaf(name: []const u8) !void {
        if (name.len == 0 or std.mem.eql(u8, name, ".") or std.mem.eql(u8, name, "..") or
            std.mem.indexOfAny(u8, name, "/\\") != null or std.mem.indexOfScalar(u8, name, 0) != null)
            return error.InvalidEvidenceName;
    }
    pub fn writeFile(self: *Sink, name: []const u8, bytes: []const u8) !void {
        try validateLeaf(name);
        try self.directory.writeFile(self.io, .{ .sub_path = name, .data = bytes, .flags = .{ .exclusive = true } });
    }
    pub fn writeCaseFile(self: *Sink, case_name: []const u8, name: []const u8, bytes: []const u8) !void {
        var valid = false;
        inline for (.{ "hwp5", "hwpx" }) |format| {
            inline for (.{ "new7", "reset-character", "reset-paragraph", "reset-all" }) |mode| {
                if (std.mem.eql(u8, case_name, format ++ "-" ++ mode)) valid = true;
            }
        }
        if (!valid) return error.InvalidEvidenceCase;
        try validateLeaf(name);
        var allowed_file = false;
        inline for (.{ "source", "edited", "restored", "redone", "noop", "metadata.json" }) |allowed| {
            if (std.mem.eql(u8, name, allowed)) allowed_file = true;
        }
        if (!allowed_file) return error.InvalidEvidenceName;
        var child = try self.directory.createDirPathOpen(self.io, case_name, .{});
        defer child.close(self.io);
        try child.writeFile(self.io, .{ .sub_path = name, .data = bytes, .flags = .{ .exclusive = true } });
    }
};

test "evidence output disabled and invalid roots perform no filesystem IO" {
    try std.testing.expect((try Sink.fromDirectory(std.testing.io, null)) == null);
    inline for (.{ "", "relative", "/tmp/../unsafe", "/tmp/legacy/hwpers/subtree", "/tmp/title-column-roundtrip.test.mjs", "/tmp/hwpers_test4_complex_table.hwp" }) |path| {
        try std.testing.expectError(error.InvalidEvidenceDirectory, Sink.openAbsolute(std.testing.io, path));
    }
}

test "evidence output owned case export is exact exclusive and scoped" {
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    var sink: Sink = .{ .io = std.testing.io, .directory = try tmp.dir.openDir(std.testing.io, ".", .{}) };
    defer sink.deinit();
    try std.testing.expectError(error.InvalidEvidenceCase, sink.writeCaseFile("../escape", "source", "bad"));
    try std.testing.expectError(error.InvalidEvidenceName, sink.writeCaseFile("hwp5-new7", "../escape", "bad"));
    try std.testing.expectError(error.InvalidEvidenceName, sink.writeCaseFile("hwp5-new7", "extra", "bad"));
    try sink.writeCaseFile("hwp5-new7", "source", "exact evidence");
    try std.testing.expectError(error.PathAlreadyExists, sink.writeCaseFile("hwp5-new7", "source", "replacement"));
    const actual = try tmp.dir.readFileAlloc(std.testing.io, "hwp5-new7/source", std.testing.allocator, .limited(100));
    defer std.testing.allocator.free(actual);
    try std.testing.expectEqualStrings("exact evidence", actual);
}
