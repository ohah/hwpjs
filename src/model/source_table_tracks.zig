//! Exact source interval equations: prefix[end] - prefix[start] = length.
//! A disconnected prefix is unknown; positivity never becomes a guess or repair.
const std = @import("std");
pub const Constraint = struct { start: u32, end: u32, length: u32 };
const none = std.math.maxInt(usize);
const Edge = struct { to: u32, delta: i64, next: usize };

// Common unmerged sources already name every track. Avoid constructing an edge
// graph proportional to all physical cells when those direct values suffice.
fn direct(a: std.mem.Allocator, count: u32, total: u32, constraints: []const Constraint) !?[]u32 {
    const out = try a.alloc(u32, count);
    errdefer a.free(out);
    @memset(out, 0);
    for (constraints) |c| {
        if (c.start >= c.end or c.end > count or c.length == 0) return error.UnsupportedSourceSpanGeometry;
        if (c.end - c.start == 1) {
            if (out[c.start] != 0 and out[c.start] != c.length) return error.ConflictingSourceTableTracks;
            out[c.start] = c.length;
        }
    }
    for (out) |v| if (v == 0) {
        a.free(out);
        return null;
    };
    const prefix = try a.alloc(u64, @as(usize, count) + 1);
    defer a.free(prefix);
    prefix[0] = 0;
    for (out, 0..) |v, i| {
        if (v > 0x7fffffff) return error.UnsupportedSourceSpanGeometry;
        prefix[i + 1] = prefix[i] + v;
    }
    if (prefix[count] != total) return error.ConflictingSourceTableTracks;
    for (constraints) |c| if (prefix[c.end] - prefix[c.start] != c.length) return error.ConflictingSourceTableTracks;
    return out;
}

pub fn resolve(a: std.mem.Allocator, count: u32, total: u32, constraints: []const Constraint) ![]u32 {
    if (count == 0 or total == 0) return error.UnsupportedSourceSpanGeometry;
    if (try direct(a, count, total, constraints)) |out| return out;
    const nodes = try std.math.add(usize, count, 1);
    const edge_count = try std.math.mul(usize, try std.math.add(usize, constraints.len, 1), 2);
    const heads = try a.alloc(usize, nodes);
    defer a.free(heads);
    @memset(heads, none);
    const edges = try a.alloc(Edge, edge_count);
    defer a.free(edges);
    var used: usize = 0;
    for (0..constraints.len + 1) |i| {
        const c: Constraint = if (i == constraints.len) .{ .start = 0, .end = count, .length = total } else constraints[i];
        if (c.start >= c.end or c.end > count or c.length == 0) return error.UnsupportedSourceSpanGeometry;
        edges[used] = .{ .to = c.end, .delta = c.length, .next = heads[c.start] };
        heads[c.start] = used;
        used += 1;
        edges[used] = .{ .to = c.start, .delta = -@as(i64, c.length), .next = heads[c.end] };
        heads[c.end] = used;
        used += 1;
    }
    const positions = try a.alloc(i64, nodes);
    defer a.free(positions);
    const known = try a.alloc(bool, nodes);
    defer a.free(known);
    @memset(known, false);
    const queue = try a.alloc(u32, nodes);
    defer a.free(queue);
    queue[0] = 0;
    known[0] = true;
    positions[0] = 0;
    var begin: usize = 0;
    var end: usize = 1;
    while (begin < end) : (begin += 1) {
        const from = queue[begin];
        var at = heads[from];
        while (at != none) {
            const edge = edges[at];
            const value = try std.math.add(i64, positions[from], edge.delta);
            if (known[edge.to]) {
                if (positions[edge.to] != value) return error.ConflictingSourceTableTracks;
            } else {
                known[edge.to] = true;
                positions[edge.to] = value;
                queue[end] = edge.to;
                end += 1;
            }
            at = edge.next;
        }
    }
    if (end != nodes) return error.AmbiguousSourceTableTracks;
    const out = try a.alloc(u32, count);
    errdefer a.free(out);
    for (out, 0..) |*v, i| {
        const length = try std.math.sub(i64, positions[i + 1], positions[i]);
        if (length <= 0 or length > 0x7fffffff) return error.UnsupportedSourceSpanGeometry;
        v.* = @intCast(length);
    }
    return out;
}
