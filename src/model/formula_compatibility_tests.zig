const std = @import("std");
test "formula compatibility entrypoints share exact model types and functions" {
    const shared = @import("formula_range.zig");
    const legacy = @import("../hwp5/body/formula_range.zig");
    inline for (.{ "Function", "Axis", "Address", "Cell", "Rectangle", "Range" }) |name| {
        try std.testing.expect(@field(shared, name) == @field(legacy, name));
    }
    try std.testing.expect(shared.resolveAddress == legacy.resolveAddress);
    try std.testing.expect(@import("formula_selection.zig").Iterator == @import("../hwp5/body/formula_selection.zig").Iterator);
}
