//! Classification only. A recognized command is not necessarily implemented.
const std = @import("std");
const symbols = @import("symbols.zig");
pub const Family = enum {
    fraction,
    atop,
    square_root,
    root,
    superscript,
    subscript,
    roman,
    italic,
    bold,
    function,
    lower_limit,
    upper_limit,
    integral,
    big_operator,
    matrix,
    cases,
    alignment,
    pile,
    left_delimiter,
    right_delimiter,
    decoration,
    relation,
    long_division,
    ladder,
    benzene,
    big_delimiter,
    choose,
    color,
    scale,
    left_script,
    symbol,
};
const Glue = @import("command_glue.zig").Policy;
pub const Group = struct { family: Family, names: []const []const u8, case_sensitive: bool = false, glue: Glue = .none };
pub const groups = [_]Group{
    .{ .family = .fraction, .names = &.{"over"}, .glue = .digit },
    .{ .family = .atop, .names = &.{"atop"}, .glue = .digit },
    .{ .family = .square_root, .names = &.{"sqrt"}, .glue = .digit },
    .{ .family = .root, .names = &.{"root"}, .glue = .digit },
    .{ .family = .superscript, .names = &.{"sup"} },
    .{ .family = .subscript, .names = &.{"sub"} },
    .{ .family = .roman, .names = &.{"rm"}, .glue = .alphanumeric },
    .{ .family = .italic, .names = &.{"it"}, .glue = .alphanumeric },
    .{ .family = .bold, .names = &.{"bold"}, .glue = .alphanumeric },
    .{ .family = .lower_limit, .names = &.{"lim"}, .case_sensitive = true },
    .{ .family = .upper_limit, .names = &.{"Lim"}, .case_sensitive = true },
    .{ .family = .function, .names = &.{ "sin", "cos", "tan", "cot", "sec", "cosec", "csc", "sinh", "cosh", "tanh", "coth", "log", "ln", "lg" }, .glue = .alphanumeric },
    .{ .family = .function, .names = &.{ "arcsin", "arccos", "arctan", "asin", "acos", "atan", "exp", "det", "gcd", "lcm", "mod", "max", "min" } },
    .{ .family = .integral, .names = &.{ "int", "oint", "dint", "tint", "odint", "otint" } },
    .{ .family = .big_operator, .names = &.{ "sum", "prod", "coprod", "bigcap", "bigcup", "bigsqcap", "bigsqcup", "bigoplus", "bigotimes", "bigodot", "bigvee", "bigwedge" } },
    .{ .family = .matrix, .names = &.{ "matrix", "pmatrix", "bmatrix", "dmatrix" } },
    .{ .family = .cases, .names = &.{"cases"} },
    .{ .family = .alignment, .names = &.{"eqalign"} },
    .{ .family = .pile, .names = &.{ "pile", "lpile", "rpile" } },
    .{ .family = .left_delimiter, .names = &.{"left"} },
    .{ .family = .right_delimiter, .names = &.{"right"} },
    .{ .family = .decoration, .names = &.{ "acute", "grave", "ddot", "dot", "hat", "check", "bar", "vec", "dyad", "under", "arch", "tilde", "overline", "underline", "widehat", "widetilde" } },
    .{ .family = .relation, .names = &.{ "rel", "buildrel" } },
    .{ .family = .long_division, .names = &.{"longdiv"} },
    .{ .family = .ladder, .names = &.{ "ladder", "sladder" } },
    .{ .family = .benzene, .names = &.{"benzene"} },
    .{ .family = .big_delimiter, .names = &.{"bigg"} },
    .{ .family = .choose, .names = &.{ "choose", "binom" } },
    .{ .family = .color, .names = &.{"color"} },
    .{ .family = .scale, .names = &.{"scale"} },
    .{ .family = .left_script, .names = &.{ "lsub", "lsup" } },
};
pub const Command = struct { family: Family, canonical: []const u8, consumed: usize };
/// Match the reference's single font operand boundary, not persistent row state.
pub fn blocksFontOperand(family: Family) bool {
    return switch (family) {
        .roman, .italic, .bold, .function, .symbol, .decoration, .integral, .big_operator => false,
        else => true,
    };
}
fn equal(group: Group, left: []const u8, right: []const u8) bool {
    return if (group.case_sensitive) std.mem.eql(u8, left, right) else std.ascii.eqlIgnoreCase(left, right);
}
pub fn lookup(word: []const u8) ?Command {
    for (groups) |group| for (group.names) |name| {
        if (equal(group, word, name)) return .{ .family = group.family, .canonical = name, .consumed = word.len };
    };
    if (symbols.lookup(word)) |entry| return .{ .family = .symbol, .canonical = entry.name, .consumed = word.len };
    return null;
}
/// Whole keywords win, then the longest explicitly glue-enabled prefix.
pub fn prefix(word: []const u8) ?Command {
    if (lookup(word)) |command| return command;
    for (word) |byte| if (!std.ascii.isAlphanumeric(byte)) return null;
    return prefixAsciiWord(word);
}
/// Internal semantic-stream fast path: caller already proved the whole word ASCII alphanumeric.
pub fn prefixAsciiWord(word: []const u8) ?Command {
    if (lookup(word)) |command| return command;
    var found: ?Command = null;
    for (groups) |group| {
        if (group.glue == .none) continue;
        for (group.names) |name| {
            if (name.len >= word.len or !equal(group, word[0..name.len], name)) continue;
            if (!group.glue.permits(word[name.len])) continue;
            if (found == null or name.len > found.?.consumed) found = .{ .family = group.family, .canonical = name, .consumed = name.len };
        }
    }
    for (symbols.entries) |entry| {
        if (entry.glue == .none or entry.name.len >= word.len or !entry.glue.permits(word[entry.name.len])) continue;
        const matched = if (entry.case_sensitive) std.mem.eql(u8, entry.name, word[0..entry.name.len]) else std.ascii.eqlIgnoreCase(entry.name, word[0..entry.name.len]);
        if (matched and (found == null or entry.name.len > found.?.consumed)) found = .{ .family = .symbol, .canonical = entry.name, .consumed = entry.name.len };
    }
    return found;
}
