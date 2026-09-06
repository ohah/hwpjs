const std = @import("std");

/// Positions refer to the original Tree and UTF-16 tokens, not rendered text.
/// Scope zero joins root paragraphs across sections; list scopes are section-local.
pub const Event = struct {
    section: usize,
    scope: usize,
    paragraph: usize,
    unit: usize,
    value: union(enum) { start: ?u32, end: u32 },
};
pub const Report = struct {
    starts: usize = 0,
    ends: usize = 0,
    pairs: usize = 0,
    unindexed_pairs: usize = 0,
    cross_paragraph_pairs: usize = 0,
    cross_section_pairs: usize = 0,
    id_mismatches: usize = 0,
    orphan_ends: usize = 0,
    unclosed_starts: usize = 0,
};

fn flowSection(e: Event) usize {
    return if (e.scope == 0) 0 else e.section;
}
fn sameFlow(a: Event, b: Event) bool {
    return a.scope == b.scope and flowSection(a) == flowSection(b);
}
fn less(_: void, a: Event, b: Event) bool {
    const left = [_]usize{ a.scope, flowSection(a), a.section, a.paragraph, a.unit };
    const right = [_]usize{ b.scope, flowSection(b), b.section, b.paragraph, b.unit };
    for (left, right) |x, y| {
        if (x != y) return x < y;
    }
    return false;
}

/// Diagnostic LIFO pairing for explicitly identified memo events only.
/// Does not parse HWP, validate target existence, or reject documents on nesting policy.
/// Copies input before sorting; scratch allocation depends only on observed events.
pub fn inspect(a: std.mem.Allocator, input: []const Event) !Report {
    const events = try a.dupe(Event, input);
    defer a.free(events);
    std.mem.sort(Event, events, {}, less);
    // Reject ambiguous collector positions before choosing an arbitrary tie order.
    for (events, 0..) |e, i| {
        if (i > 0 and !less({}, events[i - 1], e)) return error.DuplicateMemoRangePosition;
    }
    var stack: std.ArrayList(Event) = .empty;
    defer stack.deinit(a);
    var report: Report = .{};
    for (events, 0..) |e, i| {
        if (i > 0 and !sameFlow(events[i - 1], e)) {
            report.unclosed_starts += stack.items.len;
            stack.clearRetainingCapacity();
        }
        switch (e.value) {
            .start => {
                report.starts += 1;
                try stack.append(a, e);
            },
            .end => |id| {
                report.ends += 1;
                if (stack.pop()) |start| {
                    report.pairs += 1;
                    if (start.value.start) |known| {
                        report.id_mismatches += @intFromBool(known != id);
                    } else report.unindexed_pairs += 1;
                    report.cross_section_pairs += @intFromBool(start.section != e.section);
                    report.cross_paragraph_pairs += @intFromBool(start.section != e.section or start.paragraph != e.paragraph);
                } else report.orphan_ends += 1;
            },
        }
    }
    report.unclosed_starts += stack.items.len;
    return report;
}
