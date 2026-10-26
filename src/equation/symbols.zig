//! Symbol spellings, case policy and Unicode payload have one owner.
const std = @import("std");
pub const Role = enum { operand, operator, relation, delimiter, postfix, punctuation };
pub const Basis = enum { documented, observed_alias, observed_compatibility };
pub const Entry = struct { name: []const u8, glyph: []const u8, role: Role, case_sensitive: bool = false, glue: @import("command_glue.zig").Policy = .none, basis: Basis = .documented };
fn exact(name: []const u8, glyph: []const u8, role: Role) Entry {
    return .{ .name = name, .glyph = glyph, .role = role, .case_sensitive = true };
}
fn letter(name: []const u8, glyph: []const u8) Entry {
    return exact(name, glyph, .operand);
}
fn symbol(name: []const u8, glyph: []const u8, role: Role) Entry {
    return .{ .name = name, .glyph = glyph, .role = role };
}
fn glued(name: []const u8, glyph: []const u8, role: Role) Entry {
    return .{ .name = name, .glyph = glyph, .role = role, .glue = .alphanumeric };
}
pub const entries = [_]Entry{
    letter("alpha", "α"),
    letter("beta", "β"),
    letter("gamma", "γ"),
    letter("delta", "δ"),
    letter("epsilon", "ε"),
    letter("zeta", "ζ"),
    letter("eta", "η"),
    letter("theta", "θ"),
    letter("iota", "ι"),
    letter("kappa", "κ"),
    letter("lambda", "λ"),
    letter("mu", "μ"),
    letter("nu", "ν"),
    letter("xi", "ξ"),
    letter("omicron", "ο"),
    letter("pi", "π"),
    letter("rho", "ρ"),
    letter("sigma", "σ"),
    letter("tau", "τ"),
    letter("upsilon", "υ"),
    letter("phi", "φ"),
    letter("chi", "χ"),
    letter("psi", "ψ"),
    letter("omega", "ω"),
    letter("Alpha", "Α"),
    letter("Beta", "Β"),
    letter("Gamma", "Γ"),
    letter("Delta", "Δ"),
    letter("Epsilon", "Ε"),
    letter("Zeta", "Ζ"),
    letter("Eta", "Η"),
    letter("Theta", "Θ"),
    letter("Iota", "Ι"),
    letter("Kappa", "Κ"),
    letter("Lambda", "Λ"),
    letter("Mu", "Μ"),
    letter("Nu", "Ν"),
    letter("Xi", "Ξ"),
    letter("Omicron", "Ο"),
    letter("Pi", "Π"),
    letter("Rho", "Ρ"),
    letter("Sigma", "Σ"),
    letter("Tau", "Τ"),
    letter("Upsilon", "Υ"),
    letter("Phi", "Φ"),
    letter("Chi", "Χ"),
    letter("Psi", "Ψ"),
    letter("Omega", "Ω"),
    letter("vartheta", "ϑ"),
    letter("varpi", "ϖ"),
    letter("varsigma", "ς"),
    letter("varupsilon", "ϒ"),
    letter("varphi", "φ"),
    letter("varepsilon", "ε"),
    glued("times", "×", .operator),
    glued("sim", "∼", .relation),
    symbol("inf", "∞", .operand),
    symbol("prime", "′", .postfix),
    glued("cdots", "⋯", .punctuation),
    glued("ldots", "…", .punctuation),
    glued("vdots", "⋮", .punctuation),
    glued("ddots", "⋱", .punctuation),
    glued("triangle", "△", .operand),
    symbol("angle", "∠", .operand),
    // CAP differs from the official table image; paired Hangul PDF examples
    // and RHWP both show cap=intersection and cup=union (topic evidence).
    .{ .name = "cap", .glyph = "∩", .role = .operator, .basis = .observed_compatibility },
    .{ .name = "cup", .glyph = "∪", .role = .operator, .basis = .observed_compatibility },
    glued("geq", "≥", .relation),
    glued("leq", "≤", .relation),
    .{ .name = "ge", .glyph = "≥", .role = .relation, .glue = .digit, .basis = .observed_alias },
    .{ .name = "le", .glyph = "≤", .role = .relation, .glue = .digit, .basis = .observed_alias },
    symbol("neq", "≠", .relation),
    symbol("pm", "±", .operator),
    symbol("plusminus", "±", .operator),
    symbol("mp", "∓", .operator),
    symbol("minusplus", "∓", .operator),
    symbol("div", "÷", .operator),
    symbol("divide", "÷", .operator),
    symbol("in", "∈", .relation),
    symbol("notin", "∉", .relation),
    symbol("subset", "⊂", .relation),
    symbol("supset", "⊃", .relation),
    symbol("subseteq", "⊆", .relation),
    symbol("supseteq", "⊇", .relation),
    symbol("owns", "∋", .relation),
    exact("larrow", "←", .relation),
    exact("LARROW", "⇐", .relation),
    exact("rarrow", "→", .relation),
    exact("RARROW", "⇒", .relation),
    exact("uparrow", "↑", .relation),
    exact("UPARROW", "⇑", .relation),
    exact("downarrow", "↓", .relation),
    exact("DOWNARROW", "⇓", .relation),
    exact("udarrow", "↕", .relation),
    exact("UDARROW", "⇕", .relation),
    exact("lrarrow", "↔", .relation),
    exact("LRARROW", "⇔", .relation),
    exact("vert", "∣", .delimiter),
    exact("VERT", "∥", .delimiter),
    symbol("mapsto", "↦", .relation),
    symbol("nwarrow", "↖", .relation),
    symbol("nearrow", "↗", .relation),
    symbol("swarrow", "↙", .relation),
    symbol("searrow", "↘", .relation),
    symbol("hookleft", "↩", .relation),
    symbol("hookright", "↪", .relation),
    symbol("->", "→", .relation),
    symbol("<=", "≤", .relation),
    symbol(">=", "≥", .relation),
    symbol("!=", "≠", .relation),
    symbol("==", "≡", .relation),
    symbol("<<", "≪", .relation),
    symbol(">>", "≫", .relation),
    symbol("<<<", "⋘", .relation),
    symbol(">>>", "⋙", .relation),
};
pub fn lookup(name: []const u8) ?Entry {
    for (entries) |entry| {
        const matched = if (entry.case_sensitive) std.mem.eql(u8, entry.name, name) else std.ascii.eqlIgnoreCase(entry.name, name);
        if (matched) return entry;
    }
    return null;
}
