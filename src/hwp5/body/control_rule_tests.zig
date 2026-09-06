const std = @import("std");
const t = std.testing;
const rules = @import("control_rules.zig");
const validation = @import("control_type_validation.zig");
const Link = @import("control_links.zig").Link;
fn link(id: u32, code: u16) Link {
    return .{ .paragraph_node = 0, .text_node = 1, .control_node = 2, .start_unit = 0, .id = id, .header_id = id, .code = code };
}
test "control rule IDs are unique and reject every wrong code in the table domain" {
    try t.expectEqual(53, rules.rules.len);
    for (rules.rules, 0..) |rule, i| {
        for (rules.rules[i + 1 ..]) |other| try t.expect(rule.control_id != other.control_id);
        for (0..32) |code| {
            const links = [_]Link{link(rule.control_id, @intCast(code))};
            if (code == rule.code) {
                const report = try validation.inspect(&links);
                try t.expectEqual(1, report.checked);
                try t.expectEqual(0, report.deferred);
            } else try t.expectError(error.ControlCodeMismatch, validation.inspect(&links));
        }
    }
}
test "control type validation preserves unknown case and space sensitive IDs" {
    try t.expectEqual(0x74626c20, rules.id("tbl "));
    try t.expectEqual(2, rules.expectedCode(rules.section_id).?);
    try t.expectEqual(2, rules.expectedCode(rules.column_id).?);
    try t.expectEqual(18, rules.expectedCode(rules.id("atno")).?);
    try t.expectEqual(22, rules.expectedCode(rules.id("bokm")).?);
    try t.expect(rules.expectedCode(rules.id("FN  ")) == null);
    try t.expect(rules.expectedCode(rules.id("%zzz")) == null);
    const report = try validation.inspect(&.{ link(rules.id("tbl "), 11), link(rules.id("%zzz"), 3) });
    try t.expectEqual(1, report.checked);
    try t.expectEqual(1, report.deferred);
    const empty = try validation.inspect(&.{});
    try t.expectEqual(0, empty.checked);
}
