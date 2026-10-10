//! Explicit conversion to a plaintext ZIP. Original input is never modified.
const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("password_manifest.zig");
const entry_crypto = @import("password_entry.zig");
const writer = @import("../zip/replace_writer.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_total_plaintext_bytes: usize = 128 * 1024 * 1024,
    manifest: manifest.Options = .{},
    entry: entry_crypto.Options = .{},
};

/// Null means unencrypted, with no ZIP rewrite. Non-null is caller-owned and
/// unencrypted, not suitable for silently overwriting a protected document.
pub fn decryptToPlaintext(a: std.mem.Allocator, input: []const u8, password: []const u8, options: Options) !?[]u8 {
    if (input.len > options.max_input_bytes) return error.LimitExceeded;
    var archive = try zip.open(a, input, .{});
    defer archive.deinit();
    var report = try manifest.read(a, archive, options.manifest);
    defer report.deinit(a);
    if (report.entries.len == 0) return null;
    var total: usize = 0;
    for (report.entries) |encrypted| {
        if (encrypted.plaintext_size > options.max_total_plaintext_bytes -| total) return error.LimitExceeded;
        total += encrypted.plaintext_size;
    }
    var replacements: std.ArrayList(writer.Replacement) = .empty;
    defer {
        for (replacements.items) |replacement| {
            const owned: []u8 = @constCast(replacement.bytes);
            std.crypto.secureZero(u8, owned);
            a.free(owned);
        }
        replacements.deinit(a);
    }
    for (report.entries) |encrypted| {
        var index: ?usize = null;
        for (archive.entries, 0..) |item, at| if (std.mem.eql(u8, item.name, encrypted.path)) {
            index = at;
            break;
        };
        const at = index orelse return error.MissingEncryptedEntry;
        const ciphertext = try archive.decode(archive.entries[at], options.entry.max_ciphertext_bytes);
        defer a.free(ciphertext);
        const plaintext = try entry_crypto.decrypt(a, ciphertext, password, encrypted.parameters, encrypted.plaintext_size, options.entry);
        errdefer {
            std.crypto.secureZero(u8, plaintext);
            a.free(plaintext);
        }
        try replacements.append(a, .{ .entry_index = at, .bytes = plaintext });
    }
    const manifest_entry = archive.find("META-INF/manifest.xml") orelse return error.MissingEncryptionManifest;
    const source_xml = try archive.decode(manifest_entry, options.manifest.manifest.max_xml_bytes);
    defer a.free(source_xml);
    {
        const plain_xml = try @import("encryption_manifest_clear.zig").remove(a, source_xml, options.manifest.manifest);
        errdefer a.free(plain_xml);
        var manifest_index: ?usize = null;
        for (archive.entries, 0..) |item, at| if (std.mem.eql(u8, item.name, manifest_entry.name)) {
            manifest_index = at;
            break;
        };
        try replacements.append(a, .{ .entry_index = manifest_index orelse return error.MissingEncryptionManifest, .bytes = plain_xml });
    }
    return try writer.write(a, input, replacements.items, .{ .max_output_bytes = options.max_output_bytes });
}
