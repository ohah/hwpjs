//! Opt-in, copy-only repair of observed nonconforming CFB metadata fields.
//! The returned file is still opened by the full strict reader. Never rewrite
//! the caller's bytes or treat the original CFB as spec-conforming.
const std = @import("std");
const h = @import("header.zig");
const cfb = @import("reader.zig");
const format = @import("format.zig");

pub const Deviations = struct {
    original_root_created: u64,
    zero_fat_tail_slots: usize,
    zero_mini_tail_slots: usize,
};

pub const Result = struct {
    file: cfb.File,
    deviations: Deviations,

    pub fn deinit(self: *Result) void {
        self.file.deinit();
        self.* = undefined;
    }
};

fn rootNameMatches(entry: []const u8) bool {
    const name = format.root_name;
    if (entry.len < 128 or std.mem.readInt(u16, entry[64..66], .little) != (name.len + 1) * 2 or entry[66] != 5) return false;
    for (name, 0..) |ch, index| {
        if (entry[index * 2] != ch or entry[index * 2 + 1] != 0) return false;
    }
    return entry[name.len * 2] == 0 and entry[name.len * 2 + 1] == 0;
}

/// Accepts a CFB payload after a separate strict failure. Only zero-filled
/// FAT cells beyond EOF, MiniFAT cells beyond mini-stream capacity, and a
/// nonzero root creation time are changed in a
/// temporary copy; every other strict invariant must pass unchanged.
pub fn open(a: std.mem.Allocator, input: []const u8, limits: cfb.Options) !Result {
    if (input.len > limits.max_input_bytes) return error.LimitExceeded;
    const header = try h.Header.parse(input);
    try @import("strict.zig").header(input, header);
    if (header.difat_count != 0 or header.fat_count == 0 or header.fat_count > 109) return error.UnsupportedObservedDeviation;
    const sector_count = input.len / header.sector_size - 1;
    if (header.directory_start >= sector_count) return error.UnsupportedObservedDeviation;
    const root_offset = (@as(usize, header.directory_start) + 1) * header.sector_size;
    if (!rootNameMatches(input[root_offset..][0..128])) return error.UnsupportedObservedDeviation;

    const patched = try a.dupe(u8, input);
    defer a.free(patched);
    var repaired: Deviations = .{ .original_root_created = 0, .zero_fat_tail_slots = 0, .zero_mini_tail_slots = 0 };
    for (0..header.fat_count) |index| {
        const fat_sector = try h.int(u32, patched, 76 + 4 * index);
        if (fat_sector >= sector_count or fat_sector == header.directory_start) return error.UnsupportedObservedDeviation;
        const start = (@as(usize, fat_sector) + 1) * header.sector_size;
        for (0..header.sector_size / 4) |slot| {
            if (index * (header.sector_size / 4) + slot < sector_count) continue;
            const offset = start + slot * 4;
            const value = try h.int(u32, patched, offset);
            if (value == h.free) continue;
            if (value != 0) return error.UnsupportedObservedDeviation;
            std.mem.writeInt(u32, patched[offset..][0..4], h.free, .little);
            repaired.zero_fat_tail_slots += 1;
        }
    }
    repaired.original_root_created = try h.int(u64, patched, root_offset + 100);
    if (repaired.original_root_created != 0) std.mem.writeInt(u64, patched[root_offset + 100 ..][0..8], 0, .little);
    if (header.mini_count == 1) {
        const mini_sector = header.mini_start;
        if (mini_sector >= sector_count or mini_sector == header.directory_start) return error.UnsupportedObservedDeviation;
        for (0..header.fat_count) |index| {
            if (mini_sector == try h.int(u32, patched, 76 + 4 * index)) return error.UnsupportedObservedDeviation;
        }
        const mini_offset = (@as(usize, mini_sector) + 1) * header.sector_size;
        const root_size = if (header.major == 3) @as(u64, try h.int(u32, patched, root_offset + 120)) else try h.int(u64, patched, root_offset + 120);
        const capacity = root_size / 64 + @intFromBool(root_size % 64 != 0);
        if (capacity > header.sector_size / 4) return error.UnsupportedObservedDeviation;
        for (@as(usize, @intCast(capacity))..header.sector_size / 4) |slot| {
            const offset = mini_offset + slot * 4;
            const value = try h.int(u32, patched, offset);
            if (value == h.free) continue;
            if (value != 0) return error.UnsupportedObservedDeviation;
            std.mem.writeInt(u32, patched[offset..][0..4], h.free, .little);
            repaired.zero_mini_tail_slots += 1;
        }
    }
    if (repaired.original_root_created == 0 and repaired.zero_fat_tail_slots == 0 and repaired.zero_mini_tail_slots == 0) return error.NoObservedDeviation;
    var strict_limits = limits;
    strict_limits.strict = true;
    return .{ .file = try cfb.File.open(a, patched, strict_limits), .deviations = repaired };
}
