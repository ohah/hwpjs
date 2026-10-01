//! New ZIP output with selected payload replacements. No filesystem mutation.
//! Reader owns framing validation; unchanged local records and opaque gaps stay
//! raw. Central offsets are derived, never persisted as a second mutable model.
const std = @import("std");
const zip = @import("archive.zig");
const deflate = @import("../compression/raw_deflate.zig");
pub const Replacement = struct { entry_index: usize, bytes: []const u8 };
pub const Options = struct { read: zip.Options = .{}, max_output_bytes: usize = 128 * 1024 * 1024 };
const Prepared = struct { bytes: []u8, crc: u32, size: usize };
const Local = struct { index: usize, offset: usize };

pub fn write(a: std.mem.Allocator, input: []const u8, replacements: []const Replacement, options: Options) ![]u8 {
    var archive = try zip.open(a, input, options.read);
    defer archive.deinit();
    const output_limit = @min(options.max_output_bytes, 0xfffffffe);
    if (input.len > output_limit) return error.LimitExceeded;
    const prepared = try a.alloc(?Prepared, archive.entries.len);
    defer a.free(prepared);
    @memset(prepared, null);
    defer for (prepared) |item| if (item) |value| a.free(value.bytes);
    const seen = try a.alloc(bool, archive.entries.len);
    defer a.free(seen);
    @memset(seen, false);
    var changed = false;
    for (replacements) |replacement| {
        if (replacement.entry_index >= archive.entries.len) return error.InvalidEntryIndex;
        const index = replacement.entry_index;
        if (seen[index]) return error.DuplicateReplacement;
        seen[index] = true;
        if (replacement.bytes.len > options.read.max_entry_bytes) return error.LimitExceeded;
        const entry = archive.entries[index];
        const original = try archive.decode(entry, options.read.max_entry_bytes);
        defer a.free(original);
        if (std.mem.eql(u8, original, replacement.bytes)) continue;
        const encoded = if (entry.method == 0) try a.dupe(u8, replacement.bytes) else try deflate.encodeStored(a, replacement.bytes, options.max_output_bytes);
        prepared[index] = .{ .bytes = encoded, .crc = std.hash.Crc32.hash(replacement.bytes), .size = replacement.bytes.len };
        changed = true;
    }
    if (!changed) return a.dupe(u8, input);
    const locals = try a.alloc(Local, archive.entries.len);
    defer a.free(locals);
    const offsets = try a.alloc(usize, archive.entries.len);
    defer a.free(offsets);
    for (archive.entries, 0..) |entry, index| locals[index] = .{ .index = index, .offset = entry.local_offset };
    std.mem.sort(Local, locals, {}, struct {
        fn less(_: void, lhs: Local, rhs: Local) bool {
            return lhs.offset < rhs.offset;
        }
    }.less);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var cursor: usize = 0;
    for (locals) |local| {
        const entry = archive.entries[local.index];
        try append(a, &out, input[cursor..entry.local_offset], options.max_output_bytes);
        offsets[local.index] = out.items.len;
        if (prepared[local.index]) |value| {
            const data_start = @intFromPtr(entry.compressed.ptr) - @intFromPtr(input.ptr);
            const header_at = out.items.len;
            try append(a, &out, input[entry.local_offset..data_start], options.max_output_bytes);
            const descriptor = entry.flags & 8 != 0;
            try patch(&out, header_at + 14, if (descriptor) 0 else value.crc);
            try patch(&out, header_at + 18, if (descriptor) 0 else value.bytes.len);
            try patch(&out, header_at + 22, if (descriptor) 0 else value.size);
            try append(a, &out, value.bytes, options.max_output_bytes);
            if (descriptor) {
                const old_start = data_start + entry.compressed.len;
                const length = entry.local_end - old_start;
                const descriptor_at = out.items.len;
                try append(a, &out, input[old_start..entry.local_end], options.max_output_bytes);
                const prefix: usize = if (length == 16) 4 else 0;
                try patch(&out, descriptor_at + prefix, value.crc);
                try patch(&out, descriptor_at + prefix + 4, value.bytes.len);
                try patch(&out, descriptor_at + prefix + 8, value.size);
            }
        } else try append(a, &out, input[entry.local_offset..entry.local_end], options.max_output_bytes);
        cursor = entry.local_end;
    }
    try append(a, &out, input[cursor..archive.central_start], options.max_output_bytes);
    const central_start = out.items.len;
    for (archive.entries, 0..) |entry, index| {
        const at = out.items.len;
        try append(a, &out, input[entry.central_offset..entry.central_end], options.max_output_bytes);
        try patch(&out, at + 42, offsets[index]);
        if (prepared[index]) |value| {
            try patch(&out, at + 16, value.crc);
            try patch(&out, at + 20, value.bytes.len);
            try patch(&out, at + 24, value.size);
        }
    }
    const end_at = out.items.len;
    try append(a, &out, input[archive.end_record_offset..], options.max_output_bytes);
    try patch(&out, end_at + 12, end_at - central_start);
    try patch(&out, end_at + 16, central_start);
    return out.toOwnedSlice(a);
}

fn patch(out: *std.ArrayList(u8), at: usize, value: usize) !void {
    if (value > 0xffffffff) return error.UnsupportedZip64;
    std.mem.writeInt(u32, out.items[at..][0..4], @intCast(value), .little);
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > @min(limit, 0xfffffffe) -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
