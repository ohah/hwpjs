const std = @import("std");
const t = std.testing;
const symbols = @import("symbols.zig");
const commands = @import("commands.zig");
const parser = @import("parser.zig");
test "equation symbols distinguish Greek and arrow case without changing source spellings" {
    for (symbols.entries, 0..) |entry, index| {
        try t.expectEqualStrings(entry.glyph, symbols.lookup(entry.name).?.glyph);
        try t.expect(std.unicode.utf8ValidateSlice(entry.glyph));
        try t.expectEqual(commands.Family.symbol, commands.lookup(entry.name).?.family);
        for (symbols.entries[index + 1 ..]) |other| {
            try t.expect(!std.mem.eql(u8, entry.name, other.name));
            if (!entry.case_sensitive or !other.case_sensitive) try t.expect(!std.ascii.eqlIgnoreCase(entry.name, other.name));
        }
    }
    try t.expectEqualStrings("α", symbols.lookup("alpha").?.glyph);
    try t.expectEqualStrings("Α", symbols.lookup("Alpha").?.glyph);
    try t.expect(symbols.lookup("ALPHA") == null);
    try t.expectEqualStrings("→", symbols.lookup("rarrow").?.glyph);
    try t.expectEqualStrings("⇒", symbols.lookup("RARROW").?.glyph);
    try t.expectEqualStrings("∣", symbols.lookup("vert").?.glyph);
    try t.expectEqualStrings("∥", symbols.lookup("VERT").?.glyph);
    try t.expect(symbols.lookup("Rarrow") == null);
    try t.expectEqualStrings("∩", symbols.lookup("CAP").?.glyph);
    try t.expectEqualStrings("∪", symbols.lookup("CUP").?.glyph);
    try t.expectEqual(symbols.Basis.observed_compatibility, symbols.lookup("CAP").?.basis);
    try t.expectEqual(commands.Family.big_operator, commands.lookup("PROD").?.family);
    try t.expect(symbols.lookup("PROD") == null);
    try t.expect(commands.prefix("alphabet") == null);
}
test "equation symbols parser preserves token bytes while resolving glyph and role" {
    const source = "alpha Alpha rarrow RARROW timesm x<=y cap CUP";
    var tree = try parser.parse(t.allocator, source, .{});
    defer tree.deinit();
    try t.expectEqualStrings(source, tree.source);
    var glyphs: std.ArrayList([]const u8) = .empty;
    defer glyphs.deinit(t.allocator);
    for (tree.nodes) |node| if (node.data == .symbol) {
        const value = node.data.symbol;
        try t.expectEqual(symbols.lookup(value.token.value).?.basis, value.basis);
        try t.expectEqualStrings(value.token.value, tree.source[value.token.start..value.token.end]);
        try glyphs.append(t.allocator, value.glyph);
    };
    const expected = [_][]const u8{ "α", "Α", "→", "⇒", "×", "≤", "∩", "∪" };
    try t.expectEqual(expected.len, glyphs.items.len);
    for (expected, glyphs.items) |wanted, observed| try t.expectEqualStrings(wanted, observed);
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var parsed = try parser.parse(a, "{alpha+beta} over {Gamma times 2}", .{});
            defer parsed.deinit();
        }
    }.run, .{});
}
