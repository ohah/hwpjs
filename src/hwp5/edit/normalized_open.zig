//! Explicit copy-only CFB normalization. History/save baseline is normalized,
//! not the caller's original bytes. Default Session.open remains unchanged.
const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const repairs = @import("../../cfb/observed_repairs.zig");
const Session = @import("style_preservation.zig").Session;

pub const Opened = struct {
    session: *Session,
    deviations: ?repairs.Deviations,
};

pub fn open(a: std.mem.Allocator, input: []const u8) !Opened {
    return openMode(a, input, false);
}

pub fn openDistribution(a: std.mem.Allocator, input: []const u8) !Opened {
    return openMode(a, input, true);
}

fn openSession(a: std.mem.Allocator, input: []const u8, distribution: bool) !*Session {
    return if (distribution) Session.openDistribution(a, input) else Session.open(a, input);
}

fn openMode(a: std.mem.Allocator, input: []const u8, distribution: bool) !Opened {
    const limits = @import("../text_source.zig").cfb_limits;
    if (cfb.File.open(a, input, limits)) |value| {
        var file = value;
        defer file.deinit();
        return .{ .session = try openSession(a, input, distribution), .deviations = null };
    } else |err| switch (err) {
        error.InvalidRoot, error.InvalidFat, error.InvalidUnusedEntry, error.UnclaimedMiniSector => {},
        else => return err,
    }
    var repaired = try repairs.open(a, input, limits);
    defer repaired.deinit();
    return .{ .session = try openSession(a, repaired.file.bytes, distribution), .deviations = repaired.deviations };
}
