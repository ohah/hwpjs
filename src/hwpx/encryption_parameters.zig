//! Validated ODF encryption-data subtree; no cryptography or ZIP access.
const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const key = @import("password_key.zig");
const uri = @import("encryption_manifest.zig").manifest_uri;
pub const Parameters = struct {
    checksum: [32]u8,
    iv: [16]u8,
    salt: []u8,
    iterations: u32,
    pub fn deinit(self: *Parameters, a: std.mem.Allocator) void {
        a.free(self.salt);
        self.* = undefined;
    }
};

/// May also be driven by a package manifest visitor using relative depths.
pub const Draft = struct {
    allocator: std.mem.Allocator,
    limits: key.Limits = .{},
    checksum: ?[32]u8 = null,
    iv: ?[16]u8 = null,
    salt: ?[]u8 = null,
    iterations: u32 = 0,
    start_seen: bool = false,

    pub fn deinit(self: *Draft) void {
        if (self.salt) |salt| self.allocator.free(salt);
        self.salt = null;
    }
    fn attribute(self: *Draft, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8) ![]u8 {
        return (try attrs.attribute(self.allocator, tag, scope, name, 4096)) orelse error.MissingEncryptionParameter;
    }
    fn requireValue(self: *Draft, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8, expected: []const u8) !void {
        const value = try self.attribute(tag, scope, name);
        defer self.allocator.free(value);
        if (!std.mem.eql(u8, value, expected)) return error.UnsupportedEncryptionParameters;
    }
    fn binary(self: *Draft, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8, limit: usize) ![]u8 {
        const value = try self.attribute(tag, scope, name);
        defer self.allocator.free(value);
        const decoder = std.base64.standard.Decoder;
        const length = decoder.calcSizeForSlice(value) catch return error.InvalidEncryptionParameter;
        if (length > limit) return error.LimitExceeded;
        const bytes = try self.allocator.alloc(u8, length);
        errdefer self.allocator.free(bytes);
        decoder.decode(bytes, value) catch return error.InvalidEncryptionParameter;
        return bytes;
    }
    fn fixed(self: *Draft, comptime n: usize, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8) ![n]u8 {
        const bytes = try self.binary(tag, scope, name, n);
        defer self.allocator.free(bytes);
        if (bytes.len != n) return error.InvalidEncryptionParameter;
        return bytes[0..n].*;
    }
    pub fn accept(self: *Draft, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !void {
        if (tag.kind == .end) return;
        if (depth == 1) {
            if (!try attrs.element(tag, scope, uri, "encryption-data")) return error.InvalidEncryptionParameterRoot;
            if (self.checksum != null) return error.DuplicateEncryptionParameter;
            try self.requireValue(tag, scope, "checksum-type", uri ++ "#sha256-1k");
            self.checksum = try self.fixed(32, tag, scope, "checksum");
        } else if (depth == 2 and try attrs.element(tag, scope, uri, "algorithm")) {
            if (self.iv != null) return error.DuplicateEncryptionParameter;
            try self.requireValue(tag, scope, "algorithm-name", "http://www.w3.org/2001/04/xmlenc#aes256-cbc");
            self.iv = try self.fixed(16, tag, scope, "initialisation-vector");
        } else if (depth == 2 and try attrs.element(tag, scope, uri, "key-derivation")) {
            if (self.salt != null) return error.DuplicateEncryptionParameter;
            try self.requireValue(tag, scope, "key-derivation-name", uri ++ "#pbkdf2");
            try self.requireValue(tag, scope, "key-size", "32");
            const count = try self.attribute(tag, scope, "iteration-count");
            defer self.allocator.free(count);
            if (count.len == 0) return error.InvalidEncryptionParameter;
            for (count) |digit| if (!std.ascii.isDigit(digit)) return error.InvalidEncryptionParameter;
            const iterations = std.fmt.parseInt(u32, count, 10) catch return error.InvalidEncryptionParameter;
            if (iterations == 0) return error.InvalidEncryptionParameter;
            if (iterations > self.limits.max_iterations) return error.LimitExceeded;
            const salt = try self.binary(tag, scope, "salt", self.limits.max_salt_bytes);
            if (salt.len == 0) {
                self.allocator.free(salt);
                return error.InvalidEncryptionParameter;
            }
            self.salt = salt;
            self.iterations = iterations;
        } else if (depth == 2 and try attrs.element(tag, scope, uri, "start-key-generation")) {
            if (self.start_seen) return error.DuplicateEncryptionParameter;
            try self.requireValue(tag, scope, "start-key-generation-name", "http://www.w3.org/2000/09/xmldsig#sha256");
            try self.requireValue(tag, scope, "key-size", "32");
            self.start_seen = true;
        } else return error.UnsupportedEncryptionParameters;
    }
    pub fn finish(self: *Draft) !Parameters {
        if (!self.start_seen) return error.MissingEncryptionParameter;
        const result: Parameters = .{
            .checksum = self.checksum orelse return error.MissingEncryptionParameter,
            .iv = self.iv orelse return error.MissingEncryptionParameter,
            .salt = self.salt orelse return error.MissingEncryptionParameter,
            .iterations = self.iterations,
        };
        self.salt = null;
        return result;
    }
    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Draft = @ptrCast(@alignCast(raw));
        try self.accept(tag, scope, depth);
    }
};

pub fn read(a: std.mem.Allocator, bytes: []const u8, limits: key.Limits) !Parameters {
    var draft: Draft = .{ .allocator = a, .limits = limits };
    defer draft.deinit();
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = 16 * 1024, .max_characters = 16 * 1024 } },
        .max_elements = 16,
        .max_events = 32,
        .max_depth = 4,
    }, .{ .context = &draft, .on_tag = Draft.onTag });
    return draft.finish();
}

const fixture = "<m:encryption-data xmlns:m=\"" ++ uri ++ "\" checksum-type=\"" ++ uri ++ "#sha256-1k\" checksum=\"rJ5hQCDs0V1Glg2p+QAaMh4V1ChLxlaPo6iCSvax7AY=\">" ++
    "<m:algorithm algorithm-name=\"http://www.w3.org/2001/04/xmlenc#aes256-cbc\" initialisation-vector=\"yXnJDRuDzyaJZY0F5bK2wQ==\"/>" ++
    "<m:key-derivation key-derivation-name=\"" ++ uri ++ "#pbkdf2\" key-size=\"32\" iteration-count=\"1024\" salt=\"yXnJDRuDzyaJZY0F5bK2wQ==\"/>" ++
    "<m:start-key-generation start-key-generation-name=\"http://www.w3.org/2000/09/xmldsig#sha256\" key-size=\"32\"/></m:encryption-data>";

test "HWPX encryption parameters exact observed values ownership limits and OOM" {
    const Probe = struct {
        fn run(a: std.mem.Allocator) !void {
            var parameters = try read(a, fixture, .{});
            defer parameters.deinit(a);
            try std.testing.expectEqual(@as(u32, 1024), parameters.iterations);
            try std.testing.expectEqualSlices(u8, &parameters.iv, parameters.salt);
            try std.testing.expectEqual(@as(u8, 0xac), parameters.checksum[0]);
        }
    };
    try Probe.run(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{});
    try std.testing.expectError(error.LimitExceeded, read(std.testing.allocator, fixture, .{ .max_iterations = 1023 }));
    try std.testing.expectError(error.LimitExceeded, read(std.testing.allocator, fixture, .{ .max_salt_bytes = 15 }));
    try std.testing.expectError(error.MissingEncryptionParameter, read(std.testing.allocator, "<m:encryption-data xmlns:m=\"" ++ uri ++ "\"/>", .{}));
    try std.testing.expectError(error.InvalidEncryptionParameterRoot, read(std.testing.allocator, "<encryption-data/>", .{}));
}

test "HWPX encryption parameters reject unsupported malformed and duplicate declarations" {
    const Case = struct { from: []const u8, to: []const u8, expected: anyerror };
    const cases = [_]Case{
        .{ .from = "#aes256-cbc", .to = "#aes128-cbc", .expected = error.UnsupportedEncryptionParameters },
        .{ .from = "#sha256-1k", .to = "#sha1-1k", .expected = error.UnsupportedEncryptionParameters },
        .{ .from = "key-size=\"32\"", .to = "key-size=\"16\"", .expected = error.UnsupportedEncryptionParameters },
        .{ .from = "iteration-count=\"1024\"", .to = "iteration-count=\"0\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "iteration-count=\"1024\"", .to = "iteration-count=\"-1\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "iteration-count=\"1024\"", .to = "iteration-count=\"4294967296\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "iteration-count=\"1024\"", .to = "iteration-count=\"1000001\"", .expected = error.LimitExceeded },
        .{ .from = "salt=\"yXnJDRuDzyaJZY0F5bK2wQ==\"", .to = "salt=\"\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "salt=\"yXnJDRuDzyaJZY0F5bK2wQ==\"", .to = "salt=\"!bad\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "initialisation-vector=\"yXnJDRuDzyaJZY0F5bK2wQ==\"", .to = "initialisation-vector=\"AA==\"", .expected = error.InvalidEncryptionParameter },
        .{ .from = "</m:encryption-data>", .to = "<m:algorithm/></m:encryption-data>", .expected = error.DuplicateEncryptionParameter },
        .{ .from = "</m:encryption-data>", .to = "<m:key-derivation/></m:encryption-data>", .expected = error.DuplicateEncryptionParameter },
        .{ .from = "</m:encryption-data>", .to = "<m:start-key-generation/></m:encryption-data>", .expected = error.DuplicateEncryptionParameter },
        .{ .from = "</m:encryption-data>", .to = "<algorithm/></m:encryption-data>", .expected = error.UnsupportedEncryptionParameters },
        .{ .from = "</m:encryption-data>", .to = "<m:algorithm><m:algorithm/></m:algorithm></m:encryption-data>", .expected = error.DuplicateEncryptionParameter },
    };
    for (cases) |case| {
        const mutated = try std.mem.replaceOwned(u8, std.testing.allocator, fixture, case.from, case.to);
        defer std.testing.allocator.free(mutated);
        try std.testing.expect(!std.mem.eql(u8, fixture, mutated));
        try std.testing.expectError(case.expected, read(std.testing.allocator, mutated, .{}));
    }
}
