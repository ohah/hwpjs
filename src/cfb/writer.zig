const std = @import("std");
const h = @import("header.zig");
const directory = @import("writer_directory.zig");
const layout = @import("writer_layout.zig");
const put = directory.put;
const ceil = layout.ceil;
const format = @import("format.zig");
const mini_size_unit = format.mini_sector_size;
pub const Node = directory.Node;
pub const Options = struct { version: u16 = 3, limits: @import("types.zig").Options = .{} };

/// Rebuild a canonical CFB. Returned bytes belong to the caller; inputs are borrowed.
pub fn write(backing: std.mem.Allocator, nodes: []const Node, options: Options) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();
    const s: usize = switch (options.version) {
        3 => 512,
        4 => 4096,
        else => return error.UnsupportedVersion,
    };
    const dirs = ceil(nodes.len, s / 128);
    const slots = try std.math.mul(usize, dirs, s / 128);
    const entries = try directory.prepare(a, nodes, slots, options.limits);
    var minis: usize = 0;
    var regular: usize = 0;
    for (entries) |e| {
        if (e.kind != 2) continue;
        if (!format.usesFat(e.size)) minis = try std.math.add(usize, minis, ceil(e.content.len, mini_size_unit)) else regular = try std.math.add(usize, regular, ceil(e.content.len, s));
    }
    const mini_size = try std.math.mul(usize, minis, mini_size_unit);
    if (mini_size > options.limits.max_stream_bytes) return error.LimitExceeded;
    const mini_fats = ceil(minis, s / 4);
    const roots = ceil(mini_size, s);
    const payload = try std.math.add(usize, try std.math.add(usize, dirs, mini_fats), try std.math.add(usize, roots, regular));
    const plan = try layout.Layout.init(payload, options.version, options.limits.max_input_bytes);
    const bytes = try backing.alloc(u8, plan.bytes);
    errdefer backing.free(bytes);
    @memset(bytes, 0);
    const fat = try a.alloc(u32, plan.fats * (s / 4));
    @memset(fat, h.free);
    var writer: Output = .{ .plan = plan, .bytes = bytes, .fat = fat };
    _ = writer.chain(0, dirs);
    const mini_start = writer.chain(dirs, mini_fats);
    const root_start = writer.chain(dirs + mini_fats, roots);
    entries[0].start = root_start;
    entries[0].size = mini_size;
    for (0..mini_fats) |i| @memset(plan.sector(bytes, dirs + i), 255);
    var mini: usize = 0;
    var next = dirs + mini_fats + roots;
    for (entries) |*e| {
        if (e.kind != 2 or e.size == 0) continue;
        if (!format.usesFat(e.size)) {
            e.start = @intCast(mini);
            const count = ceil(e.content.len, mini_size_unit);
            for (0..count) |i| {
                const id = mini + i;
                const table = plan.sector(bytes, dirs + id / (s / 4));
                put(u32, table, (id % (s / 4)) * 4, if (i + 1 == count) h.end else @intCast(id + 1));
                const dest = plan.sector(bytes, dirs + mini_fats + id / (s / mini_size_unit));
                const part = e.content[i * mini_size_unit .. @min(e.content.len, (i + 1) * mini_size_unit)];
                @memcpy(dest[(id % (s / mini_size_unit)) * mini_size_unit ..][0..part.len], part);
            }
            mini += count;
        } else {
            const count = ceil(e.content.len, s);
            e.start = writer.chain(next, count);
            for (0..count) |i| {
                const part = e.content[i * s .. @min(e.content.len, (i + 1) * s)];
                @memcpy(plan.sector(bytes, next + i)[0..part.len], part);
            }
            next += count;
        }
    }
    for (0..dirs * (s / 128)) |i| {
        const raw = plan.sector(bytes, i / (s / 128))[(i % (s / 128)) * 128 ..][0..128];
        if (i < entries.len) try directory.encode(raw, entries[i]) else {
            put(u32, raw, 68, h.free);
            put(u32, raw, 72, h.free);
            put(u32, raw, 76, h.free);
        }
    }
    const fat_start = payload + plan.difats;
    for (0..plan.difats) |i| {
        fat[plan.id(payload + i)] = h.difat_sector;
        const part = plan.sector(bytes, payload + i);
        @memset(part, 255);
        for (0..s / 4 - 1) |j| {
            const index = 109 + i * (s / 4 - 1) + j;
            if (index < plan.fats) put(u32, part, j * 4, plan.id(fat_start + index));
        }
        put(u32, part, s - 4, if (i + 1 == plan.difats) h.end else plan.id(payload + i + 1));
    }
    for (0..plan.fats) |i| fat[plan.id(fat_start + i)] = h.fat_sector;
    if (bytes.len > 0x80000000) fat[@import("strict.zig").rangeLock(s)] = h.end;
    for (0..plan.fats) |i| {
        const part = plan.sector(bytes, fat_start + i);
        for (0..s / 4) |j| put(u32, part, j * 4, fat[i * (s / 4) + j]);
    }
    @memcpy(bytes[0..8], &[_]u8{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 });
    put(u16, bytes, 24, 62);
    put(u16, bytes, 26, options.version);
    put(u16, bytes, 28, 0xfffe);
    put(u16, bytes, 30, if (options.version == 3) 9 else 12);
    put(u16, bytes, 32, format.mini_sector_shift);
    put(u32, bytes, 40, if (options.version == 3) 0 else @intCast(dirs));
    put(u32, bytes, 44, @intCast(plan.fats));
    put(u32, bytes, 48, plan.id(0));
    put(u32, bytes, 56, format.mini_stream_cutoff);
    put(u32, bytes, 60, mini_start);
    put(u32, bytes, 64, @intCast(mini_fats));
    put(u32, bytes, 68, if (plan.difats == 0) h.end else plan.id(payload));
    put(u32, bytes, 72, @intCast(plan.difats));
    @memset(bytes[76..512], 255);
    for (0..@min(plan.fats, 109)) |i| put(u32, bytes, 76 + i * 4, plan.id(fat_start + i));
    return bytes;
}

const Output = struct {
    plan: layout.Layout,
    bytes: []u8,
    fat: []u32,
    fn chain(self: Output, first: usize, count: usize) u32 {
        if (count == 0) return h.end;
        for (0..count) |i| self.fat[self.plan.id(first + i)] = if (i + 1 == count) h.end else self.plan.id(first + i + 1);
        return self.plan.id(first);
    }
};
