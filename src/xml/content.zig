const Input = @import("input.zig").Input;
const Cursor = @import("token_cursor.zig").Cursor;
const chars = @import("characters.zig");
pub const Report = struct { scalars: usize = 0, references: usize = 0 };
/// One CharData/reference run ending before '<'. Outside-root input is literal S
/// only: even a numeric space reference is not Misc. Never expand unknown entities.
pub fn inspect(input: *Input, max_bytes: usize, reference_options: @import("references.zig").Options, max_references: usize, outside_root: bool) !Report {
    var cursor: Cursor = .{ .input = input.*, .start = input.offset, .max_bytes = max_bytes };
    var report: Report = .{};
    var brackets: usize = 0;
    while (true) {
        // '<' belongs to the next token, not this run's byte budget.
        var look = cursor.input;
        const c = ((try look.next()) orelse break).value;
        if (c == '<') break;
        if (outside_root and !chars.whitespace(c)) return error.TextOutsideXmlRoot;
        if (c == '&') {
            if (report.references == max_references) return error.LimitExceeded;
            const ref = try cursor.reference(reference_options);
            if (ref.value == .unresolved) return error.UnresolvedXmlEntity;
            report.references += 1;
            report.scalars += 1;
            brackets = 0; // A reference interrupts lexical CharData, even &#93;.
        } else {
            if (c == '>' and brackets == 2) return error.InvalidXmlCharData;
            brackets = if (c == ']') @min(brackets + 1, 2) else 0;
            _ = try cursor.next();
            report.scalars += 1;
        }
    }
    input.* = cursor.input;
    return report;
}
