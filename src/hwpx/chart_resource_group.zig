//! Source graph: wrappers connected by chart XML or OLE identity form one owner.
const std = @import("std");
const Pair = @import("chart_pair_target.zig").Pair;

pub fn deinit(a: std.mem.Allocator, pairs: []Pair) void {
    for (pairs) |*pair| pair.deinit(a);
    a.free(pairs);
}

pub fn collect(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, seed: *const Pair) ![]Pair {
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var pairs: std.ArrayList(Pair) = .empty;
    defer {
        for (pairs.items) |*pair| pair.deinit(a);
        pairs.deinit(a);
    }
    for (session.sections) |section| {
        for (section.tree.elements, 0..) |_, node| {
            if (!@import("run_switch_anchor.zig").supported(&section.tree, node)) continue;
            var pair = try @import("chart_pair_target.zig").resolve(a, &document, &section.tree, node);
            errdefer pair.deinit(a);
            try pairs.append(a, pair);
        }
    }
    const selected = try a.alloc(bool, pairs.items.len);
    defer a.free(selected);
    @memset(selected, false);
    var changed = true;
    while (changed) {
        changed = false;
        for (pairs.items, 0..) |pair, index| {
            if (selected[index]) continue;
            var matches = connected(pair, seed.*);
            for (pairs.items, selected) |other, included| {
                if (included and connected(pair, other)) matches = true;
            }
            if (matches) {
                selected[index] = true;
                changed = true;
            }
        }
    }
    var output: std.ArrayList(Pair) = .empty;
    errdefer {
        for (output.items) |*pair| pair.deinit(a);
        output.deinit(a);
    }
    try output.ensureTotalCapacity(a, pairs.items.len);
    // Transfer only after all allocations needed by the transfer have succeeded.
    for (pairs.items, selected) |pair, included| {
        if (included) output.appendAssumeCapacity(pair) else {
            var unused = pair;
            unused.deinit(a);
        }
    }
    pairs.clearRetainingCapacity();
    return output.toOwnedSlice(a);
}

fn connected(a: Pair, b: Pair) bool {
    return std.mem.eql(u8, a.chart_path, b.chart_path) or std.mem.eql(u8, a.ole_path, b.ole_path);
}
