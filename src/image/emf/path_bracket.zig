const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const Bracket = struct { kind: records.RecordType };

pub const State = struct {
    construction_open: bool = false,

    pub fn consume(self: *State, record: records.Record) !?Bracket {
        const bracket = (try parse(record)) orelse return null;
        switch (bracket.kind) {
            .beginpath => {
                if (self.construction_open) return error.NestedEmfPathBracket;
                self.construction_open = true;
            },
            .endpath => self.construction_open = false,
            .abortpath => self.construction_open = false,
            else => {},
        }
        return bracket;
    }

    pub fn finish(self: State) !void {
        if (self.construction_open) return error.UnclosedEmfPathBracket;
    }
};

pub fn parse(record: records.Record) !?Bracket {
    switch (record.kind) {
        .beginpath,
        .endpath,
        .closefigure,
        .flattenpath,
        .widenpath,
        .abortpath,
        => {},
        else => return null,
    }
    if (!record_extent.hasRequiredPrefix(record, 8)) return error.InvalidEmfPathBracketSize;
    return .{ .kind = record.kind };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{
        .offset = 0,
        .kind = kind,
        .size = @intCast(bytes.len),
        .bytes = bytes,
        .end = bytes.len,
    };
}

test "all six path bracket records require the header and accept trailing data" {
    const std = @import("std");
    const exact = [_]u8{0} ** 8;
    const oversized = [_]u8{0} ** 12;
    const truncated = [_]u8{0} ** 4;
    for ([_]records.RecordType{
        .beginpath,
        .endpath,
        .closefigure,
        .flattenpath,
        .widenpath,
        .abortpath,
    }) |kind| {
        const value = (try parse(fixture(kind, &exact))).?;
        try std.testing.expectEqual(kind, value.kind);
        try std.testing.expectEqual(kind, (try parse(fixture(kind, &oversized))).?.kind);
        try std.testing.expectError(error.InvalidEmfPathBracketSize, parse(fixture(kind, &truncated)));
    }
}

test "non-path record is not claimed" {
    const std = @import("std");
    const bytes = [_]u8{0} ** 8;
    try std.testing.expect((try parse(fixture(.savedc, &bytes))) == null);
}

test "path construction cannot nest and must close with end or abort" {
    const std = @import("std");
    const bytes = [_]u8{0} ** 8;
    var state: State = .{};
    _ = try state.consume(fixture(.beginpath, &bytes));
    try std.testing.expect(state.construction_open);
    try std.testing.expectError(error.NestedEmfPathBracket, state.consume(fixture(.beginpath, &bytes)));
    try std.testing.expectError(error.UnclosedEmfPathBracket, state.finish());
    _ = try state.consume(fixture(.endpath, &bytes));
    try state.finish();

    _ = try state.consume(fixture(.beginpath, &bytes));
    _ = try state.consume(fixture(.abortpath, &bytes));
    try state.finish();
}
