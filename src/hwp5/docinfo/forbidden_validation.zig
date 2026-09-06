const payload = @import("forbidden_chars.zig");
pub const Layout = enum { preserve_raw, observed_lists };
pub const Report = struct {
    records: usize = 0,
    parsed: usize = 0,
    deferred: usize = 0,
    specified_levels: usize = 0,
    observed_levels: usize = 0,
    other_levels: usize = 0,
    list_units: usize = 0,
    nonempty_lists: usize = 0,
    extra_bytes: usize = 0,
    /// Failure is atomic. Opaque mode preserves unknown layouts and levels.
    pub fn observe(self: *Report, tag: u10, level: u10, bytes: []const u8, layout: Layout) !void {
        if (tag != payload.tag) return;
        var next = self.*;
        next.records += 1;
        switch (level) {
            0 => next.specified_levels += 1,
            1 => next.observed_levels += 1,
            else => next.other_levels += 1,
        }
        switch (layout) {
            .preserve_raw => next.deferred += 1,
            .observed_lists => {
                if (level > 1) return error.InvalidForbiddenCharLevel;
                const p = try payload.Lists.parseObserved(bytes);
                next.parsed += 1;
                for (p.lists) |list| {
                    next.list_units += list.len / 2;
                    next.nonempty_lists += @intFromBool(list.len != 0);
                }
                next.extra_bytes += p.extra.len;
            },
        }
        self.* = next;
    }
};
