const std = @import("std");
const t = std.testing;
const Tree = @import("form_property_tree.zig").Tree;
const schema = @import("form_schema.zig");
const refs = @import("form_references.zig");
const semantics = @import("form_semantics.zig");
fn wide(comptime ascii: []const u8) [ascii.len * 2]u8 {
    var out = [_]u8{0} ** (ascii.len * 2);
    for (ascii, 0..) |c, i| out[i * 2] = c;
    return out;
}
test "form source selection never promotes an inactive stored ID or guesses defaults" {
    inline for (.{ "", "FollowContext:bool:0 ", "FollowContext:bool:1 ", "FollowContext:bool:2 ", "FollowContext:bool:-0 ", "FollowContext:bool:-1 ", "FollowContext:bool:0001 " }, 0..) |follow, i| {
        inline for (.{ "", "CharShapeID:int:0 ", "CharShapeID:int:7 " }, 0..) |id, j| {
            const body = follow ++ id;
            const bytes = wide(std.fmt.comptimePrint("CharShapeSet:set:{d}:{s}", .{ body.len, body }));
            var tree = try Tree.parseObservedUnits(t.allocator, &bytes, .{});
            defer tree.deinit(t.allocator);
            const s = try schema.inspectObserved(tree, .edit);
            const stored = try refs.storedCharShapeObserved(tree, s, 7);
            const result = semantics.inspectObserved(tree, s, .edit, stored);
            try t.expectEqual(if (i == 1) semantics.CharSource.explicit else if (i == 2 or i == 6) semantics.CharSource.surrounding else semantics.CharSource.undetermined, result.char_source);
            const active: semantics.ActiveReference = if (i != 1) .deferred else switch (j) {
                0 => .absent,
                1 => .valid,
                2 => .invalid,
                else => unreachable,
            };
            try t.expectEqual(active, result.active_reference);
            try t.expectEqual(semantics.Choice.not_applicable, result.choice);
            try t.expectEqualSlices(u8, &wide(std.fmt.comptimePrint("CharShapeSet:set:{d}:{s}", .{ body.len, body })), &bytes);
        }
    }
}
test "choice state two requires an explicit enabled TriState for both choice kinds" {
    inline for (.{ "", "TriState:bool:0 ", "TriState:bool:1 ", "TriState:bool:-1 ", "TriState:bool:2 " }, 0..) |tri, i| {
        inline for (.{ "", "Value:int:0 ", "Value:int:1 ", "Value:int:2 ", "Value:int:3 ", "Value:int:-0 ", "Value:int:0002 ", "Value:int:999999999999999999999999 " }, 0..) |value, j| {
            const body = tri ++ value;
            const bytes = wide(std.fmt.comptimePrint("ButtonSet:set:{d}:{s}", .{ body.len, body }));
            var tree = try Tree.parseObservedUnits(t.allocator, &bytes, .{});
            defer tree.deinit(t.allocator);
            inline for (.{ @import("form_object.zig").Kind.check_box, .radio_button, .push_button }) |kind| {
                const s = try schema.inspectObserved(tree, kind);
                const result = semantics.inspectObserved(tree, s, kind, .absent);
                const expected: semantics.Choice = if (kind == .push_button) .not_applicable else if (j == 1) .unchecked else if (j == 2) .checked else if (j == 3 or j == 6) (if (i == 2) .indeterminate else if (i == 1) .invalid else .deferred) else .deferred;
                try t.expectEqual(expected, result.choice);
            }
        }
    }
}
