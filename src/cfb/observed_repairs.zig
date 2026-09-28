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
    off_by_one_fat_markers: usize,
    zero_unclaimed_fat_slots: usize,
    orphan_end_fat_slots: usize,
    zero_mini_tail_slots: usize,
    zero_unclaimed_mini_slots: usize,
    zero_unused_entries: usize,
    stale_unused_entries: usize,
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

fn fatNext(bytes: []const u8, header: h.Header, sector_count: usize, id: u32) !u32 {
    if (id >= sector_count) return error.UnsupportedObservedDeviation;
    const cells_per_sector = header.sector_size / 4;
    const table = @as(usize, id) / cells_per_sector;
    if (table >= header.fat_count) return error.UnsupportedObservedDeviation;
    const fat_sector = try h.int(u32, bytes, 76 + 4 * table);
    if (fat_sector >= sector_count) return error.UnsupportedObservedDeviation;
    return h.int(u32, bytes, (@as(usize, fat_sector) + 1) * header.sector_size + (@as(usize, id) % cells_per_sector) * 4);
}

fn miniCell(bytes: []const u8, header: h.Header, sectors: []const u32, id: usize) !u32 {
    const cells_per_sector = header.sector_size / 4;
    if (id / cells_per_sector >= sectors.len) return error.UnsupportedObservedDeviation;
    return h.int(u32, bytes, (@as(usize, sectors[id / cells_per_sector]) + 1) * header.sector_size + (id % cells_per_sector) * 4);
}

fn repairUnclaimedMini(a: std.mem.Allocator, bytes: []u8, header: h.Header, sectors: []const u32, capacity: usize, limits: cfb.Options) !usize {
    var permissive_limits = limits;
    permissive_limits.strict = false;
    var file = try cfb.File.open(a, bytes, permissive_limits);
    defer file.deinit();
    const used = try a.alloc(bool, capacity);
    defer a.free(used);
    @memset(used, false);
    for (file.entries) |entry| {
        if (entry.kind != 2 or entry.size == 0 or format.usesFat(entry.size)) continue;
        var id: u32 = entry.start;
        const count = (entry.size + format.mini_sector_size - 1) / format.mini_sector_size;
        for (0..@as(usize, @intCast(count))) |_| {
            if (id >= capacity or used[id]) return error.UnsupportedObservedDeviation;
            used[id] = true;
            id = try miniCell(bytes, header, sectors, id);
        }
        if (id != h.end) return error.UnsupportedObservedDeviation;
    }
    var changed: usize = 0;
    for (used, 0..) |active, id| {
        if (active or try miniCell(bytes, header, sectors, id) != 0) continue;
        const cells_per_sector = header.sector_size / 4;
        const offset = (@as(usize, sectors[id / cells_per_sector]) + 1) * header.sector_size + (id % cells_per_sector) * 4;
        std.mem.writeInt(u32, bytes[offset..][0..4], h.free, .little);
        changed += 1;
    }
    return changed;
}

const FatRepair = struct { zero: usize = 0, end: usize = 0 };

fn repairUnclaimedFat(a: std.mem.Allocator, bytes: []u8, header: h.Header, limits: cfb.Options) !FatRepair {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const temp = arena.allocator();
    var allocation: @import("allocation.zig").Allocation = .{ .a = temp, .sectors = .{ .bytes = bytes, .header = header } };
    try allocation.init();
    const directory = try allocation.chain(header.directory_start, null);
    const entries = try @import("directory.zig").parse(temp, directory, header, limits.max_entries);
    try @import("directory_tree.zig").build(temp, entries, limits.max_path_bytes);
    var permissive_limits = limits;
    permissive_limits.strict = false;
    try @import("streams.zig").read(temp, &allocation, entries, permissive_limits);
    var result: FatRepair = .{};
    const cells_per_sector = header.sector_size / 4;
    for (allocation.used, allocation.fat, 0..) |role, marker, id| {
        if (role != .unclaimed or marker == h.free) continue;
        if (marker != 0 and marker != h.end) return error.UnsupportedObservedDeviation;
        const table = id / cells_per_sector;
        if (table >= header.fat_count) return error.UnsupportedObservedDeviation;
        const fat_sector = try h.int(u32, bytes, 76 + 4 * table);
        const offset = (@as(usize, fat_sector) + 1) * header.sector_size + (id % cells_per_sector) * 4;
        std.mem.writeInt(u32, bytes[offset..][0..4], h.free, .little);
        if (marker == 0) result.zero += 1 else result.end += 1;
    }
    return result;
}

/// Probe narrowly observed metadata deviations after an independent strict
/// failure. All changes stay in a temporary copy and must pass the complete
/// strict reader; the exact accepted patterns are owned by the CFB repair doc.
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
    var repaired: Deviations = .{ .original_root_created = 0, .zero_fat_tail_slots = 0, .off_by_one_fat_markers = 0, .zero_unclaimed_fat_slots = 0, .orphan_end_fat_slots = 0, .zero_mini_tail_slots = 0, .zero_unclaimed_mini_slots = 0, .zero_unused_entries = 0, .stale_unused_entries = 0 };
    for (0..header.fat_count) |index| {
        const fat_sector = try h.int(u32, patched, 76 + 4 * index);
        if (fat_sector >= sector_count or fat_sector == header.directory_start) return error.UnsupportedObservedDeviation;
        const start = (@as(usize, fat_sector) + 1) * header.sector_size;
        // A single observed producer wrote the physical sector count into the
        // last FAT sector's own role cell. DIFAT independently identifies it.
        if (fat_sector == sector_count - 1) {
            const offset = start + (@as(usize, fat_sector) % (header.sector_size / 4)) * 4;
            if (try h.int(u32, patched, offset) == sector_count) {
                std.mem.writeInt(u32, patched[offset..][0..4], h.fat_sector, .little);
                repaired.off_by_one_fat_markers += 1;
            }
        }
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
    if (header.mini_count > sector_count) return error.UnsupportedObservedDeviation;
    const mini_sectors = try a.alloc(u32, header.mini_count);
    defer a.free(mini_sectors);
    var mini_capacity: usize = 0;
    if (header.mini_count != 0) {
        const cells_per_sector = header.sector_size / 4;
        const root_size = if (header.major == 3) @as(u64, try h.int(u32, patched, root_offset + 120)) else try h.int(u64, patched, root_offset + 120);
        const capacity = root_size / 64 + @intFromBool(root_size % 64 != 0);
        if (capacity > @as(u64, header.mini_count) * cells_per_sector) return error.UnsupportedObservedDeviation;
        mini_capacity = @intCast(capacity);
        var mini_sector = header.mini_start;
        for (0..header.mini_count) |index| {
            if (mini_sector >= sector_count or mini_sector == header.directory_start) return error.UnsupportedObservedDeviation;
            mini_sectors[index] = mini_sector;
            for (0..header.fat_count) |fat_index| {
                if (mini_sector == try h.int(u32, patched, 76 + 4 * fat_index)) return error.UnsupportedObservedDeviation;
            }
            const mini_offset = (@as(usize, mini_sector) + 1) * header.sector_size;
            for (0..cells_per_sector) |slot| {
                if (index * cells_per_sector + slot < capacity) continue;
                const offset = mini_offset + slot * 4;
                const value = try h.int(u32, patched, offset);
                if (value == h.free) continue;
                if (value != 0) return error.UnsupportedObservedDeviation;
                std.mem.writeInt(u32, patched[offset..][0..4], h.free, .little);
                repaired.zero_mini_tail_slots += 1;
            }
            const next = try fatNext(patched, header, sector_count, mini_sector);
            if (index + 1 == header.mini_count) {
                if (next != h.end) return error.UnsupportedObservedDeviation;
            } else {
                if (next == h.end or next == h.free) return error.UnsupportedObservedDeviation;
                mini_sector = next;
            }
        }
    }
    var directory_sector = header.directory_start;
    for (0..sector_count) |_| {
        if (directory_sector >= sector_count) return error.UnsupportedObservedDeviation;
        const start = (@as(usize, directory_sector) + 1) * header.sector_size;
        for (0..header.sector_size / 128) |slot| {
            const entry = patched[start + slot * 128 ..][0..128];
            if (entry[66] != 0 or !std.mem.allEqual(u8, entry, 0)) continue;
            @memset(entry[68..80], 0xff);
            repaired.zero_unused_entries += 1;
        }
        for (0..header.sector_size / 128) |slot| {
            const entry = patched[start + slot * 128 ..][0..128];
            if (entry[66] != 0 or entry[67] != 1 or !std.mem.allEqual(u8, entry[0..66], 0) or
                !std.mem.allEqual(u8, entry[68..80], 0xff) or !std.mem.allEqual(u8, entry[80..116], 0) or
                try h.int(u32, entry, 116) != h.end or try h.int(u32, entry, 120) == 0 or
                !std.mem.allEqual(u8, entry[124..128], 0)) continue;
            entry[67] = 0;
            @memset(entry[116..128], 0);
            repaired.stale_unused_entries += 1;
        }
        const next = try fatNext(patched, header, sector_count, directory_sector);
        if (next == h.end) break;
        if (next == h.free) return error.UnsupportedObservedDeviation;
        directory_sector = next;
    } else return error.UnsupportedObservedDeviation;
    var strict_limits = limits;
    strict_limits.strict = true;
    var failure: anyerror = undefined;
    if (cfb.File.open(a, patched, strict_limits)) |file| {
        if (std.meta.eql(repaired, std.mem.zeroes(Deviations))) {
            var no_change = file;
            no_change.deinit();
            return error.NoObservedDeviation;
        }
        return .{ .file = file, .deviations = repaired };
    } else |err| {
        if (err == error.OutOfMemory or err == error.LimitExceeded) return err;
        failure = err;
    }
    if (failure == error.UnclaimedMiniSector and mini_capacity != 0) {
        repaired.zero_unclaimed_mini_slots = try repairUnclaimedMini(a, patched, header, mini_sectors, mini_capacity, limits);
        if (repaired.zero_unclaimed_mini_slots != 0) {
            if (cfb.File.open(a, patched, strict_limits)) |file| return .{ .file = file, .deviations = repaired } else |err| {
                if (err == error.OutOfMemory or err == error.LimitExceeded) return err;
                failure = err;
            }
        }
    }
    if (failure == error.UnclaimedSector) {
        const unclaimed = try repairUnclaimedFat(a, patched, header, limits);
        repaired.zero_unclaimed_fat_slots = unclaimed.zero;
        repaired.orphan_end_fat_slots = unclaimed.end;
        if (unclaimed.zero + unclaimed.end != 0) return .{ .file = try cfb.File.open(a, patched, strict_limits), .deviations = repaired };
    }
    return if (std.meta.eql(repaired, std.mem.zeroes(Deviations))) error.NoObservedDeviation else failure;
}
