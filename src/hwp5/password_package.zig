//! Explicit new unprotected CFB; never mutates or overwrites the input.
const std = @import("std");
const Cfb = @import("../cfb/reader.zig");
const stream = @import("password_stream.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_total_plaintext_bytes: usize = 128 * 1024 * 1024,
    stream_limits: stream.Options = .{},
};

/// Caller owns new plaintext CFB. null means no password protection removed.
/// Explicit observed version0 DES / version4 AES envelopes; no guessed fallback.
pub fn decryptToPlaintext(a: std.mem.Allocator, input: []const u8, password: []const u8, options: Options) !?[]u8 {
    if (input.len > options.max_input_bytes or password.len > options.stream_limits.max_password_bytes) return error.LimitExceeded;
    var file = try Cfb.File.open(a, input, .{ .strict = true, .max_input_bytes = options.max_input_bytes });
    defer file.deinit();
    var header = try @import("file_header.zig").Header.parse(try file.readStream(a, "/FileHeader"));
    if (!header.has(.encrypted)) return null;
    const encrypt_version = header.encryptVersion();
    if (encrypt_version != 0 and encrypt_version != 4) return error.UnsupportedPasswordScheme;
    if (!header.has(.compressed)) return error.UnsupportedPasswordCompression;
    // Encrypted history payloads and invalidated signatures need their own
    // conversion contracts; do not silently preserve them as valid plaintext.
    if (header.has(.history) or header.has(.digital_signature) or header.has(.signature_preview)) return error.UnsupportedPasswordFeatures;
    std.mem.writeInt(u32, header.raw[36..40], header.flags() & ~@as(u32, 2), .little);
    std.mem.writeInt(u32, header.raw[44..48], 0, .little);
    try @import("feature_policy.zig").requireSupported(&header, .reject);
    var limits = options.stream_limits;
    limits.max_output_bytes = @min(limits.max_output_bytes, options.max_total_plaintext_bytes);
    const protected_doc = try decryptStream(a, try file.readStream(a, "/DocInfo"), password, encrypt_version, limits);
    defer release(a, protected_doc);
    var remaining = options.max_total_plaintext_bytes - protected_doc.len;
    const doc = try @import("password_properties.zig").normalize(a, protected_doc, encrypt_version, options.stream_limits.max_output_bytes);
    defer release(a, doc);
    const targets = try @import("password_targets.zig").read(a, &file, header, doc);
    defer a.free(targets);
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    const header_entry = try @import("container/paths.zig").required(&file, "/FileHeader", 2);
    nodes[try file.nodeIndex(header_entry)].content = &header.raw;
    const doc_entry = try @import("container/paths.zig").required(&file, "/DocInfo", 2);
    var owned: std.ArrayList([]u8) = .empty;
    defer {
        for (owned.items) |bytes| release(a, bytes);
        owned.deinit(a);
    }
    for (targets) |target| {
        var decoded: ?[]u8 = null;
        defer if (decoded) |bytes| release(a, bytes);
        const payload = if (target.entry_index == doc_entry) doc else blk: {
            limits.max_output_bytes = @min(options.stream_limits.max_output_bytes, remaining);
            const bytes = try decryptStream(a, file.entries[target.entry_index].content, password, encrypt_version, limits);
            decoded = bytes;
            remaining -= bytes.len;
            break :blk bytes;
        };
        const encoded = if (target.compressed)
            try @import("../compression/raw_deflate.zig").encodeStored(a, payload, options.max_output_bytes)
        else
            try a.dupe(u8, payload);
        owned.append(a, encoded) catch |err| {
            release(a, encoded);
            return err;
        };
        nodes[try file.nodeIndex(target.entry_index)].content = encoded;
    }
    const output = try Cfb.writer.write(a, nodes, .{ .version = file.header.major, .limits = .{ .max_input_bytes = options.max_output_bytes } });
    errdefer release(a, output);
    // Validate normalized properties against the actual body stream topology.
    var reopened = try @import("text_source.zig").Source.open(a, output);
    reopened.deinit();
    return output;
}

fn decryptStream(a: std.mem.Allocator, cipher: []const u8, password: []const u8, version: u32, limits: stream.Options) ![]u8 {
    return switch (version) {
        0 => @import("password_legacy_stream.zig").decryptCompressed(a, cipher, password, limits),
        4 => stream.decryptCompressed(a, cipher, password, version, limits),
        else => error.UnsupportedPasswordScheme,
    };
}

fn release(a: std.mem.Allocator, bytes: []u8) void {
    std.crypto.secureZero(u8, bytes);
    a.free(bytes);
}
