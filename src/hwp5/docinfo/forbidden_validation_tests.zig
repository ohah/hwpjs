const std = @import("std");
const t = std.testing;
const Report = @import("forbidden_validation.zig").Report;
test "forbidden policy keeps opaque separate and observed failures atomic" {
    var r: Report = .{};
    try r.observe(93, 1023, &.{}, .observed_lists);
    try t.expectEqualDeep(Report{}, r);
    try r.observe(94, 1023, &.{}, .preserve_raw);
    try t.expectEqualDeep(Report{ .records = 1, .deferred = 1, .other_levels = 1 }, r);
    const before = r;
    try t.expectError(error.InvalidForbiddenCharLevel, r.observe(94, 2, &.{}, .observed_lists));
    try t.expectError(error.UnexpectedEnd, r.observe(94, 0, &.{}, .observed_lists));
    try t.expectEqualDeep(before, r);
    var bytes = [_]u8{0} ** 19;
    bytes[8] = 1;
    bytes[16] = 32;
    bytes[18] = 255;
    for (0..2) |level| try r.observe(94, @intCast(level), &bytes, .observed_lists);
    try t.expectEqualDeep(Report{ .records = 3, .parsed = 2, .deferred = 1, .specified_levels = 1, .observed_levels = 1, .other_levels = 1, .list_units = 2, .nonempty_lists = 2, .extra_bytes = 2 }, r);
}
