const Input = @import("input.zig").Input;
const names = @import("names.zig");
const references = @import("references.zig");
/// Shared token byte budget, including nested name/attribute/reference operations.
pub const Cursor = struct {
    input: Input,
    start: usize,
    max_bytes: usize,
    pub fn remainingBytes(self: Cursor) !usize {
        if (self.input.offset < self.start or self.input.offset - self.start > self.max_bytes) return error.LimitExceeded;
        return self.max_bytes - (self.input.offset - self.start);
    }
    pub fn next(self: *Cursor) !?u21 {
        var input = self.input;
        const c = (try input.next()) orelse return null;
        if (c.end - self.input.offset > try self.remainingBytes()) return error.LimitExceeded;
        self.input = input;
        return c.value;
    }
    pub fn peek(self: Cursor) !?u21 {
        var copy = self;
        return copy.next();
    }
    pub fn require(self: *Cursor, expected: u21) !void {
        const c = (try self.next()) orelse return error.UnexpectedEnd;
        if (c != expected) return error.InvalidXmlTag;
    }
    pub fn whitespace(self: *Cursor) !bool {
        var any = false;
        while (try self.peek()) |c| {
            if (!@import("characters.zig").whitespace(c)) break;
            _ = try self.next();
            any = true;
        }
        return any;
    }
    pub fn name(self: *Cursor, max_bytes: usize) !names.Name {
        return names.parse(&self.input, @min(max_bytes, try self.remainingBytes()));
    }
    pub fn reference(self: *Cursor, options: references.Options) !references.Reference {
        var local = options;
        local.max_bytes = @min(local.max_bytes, try self.remainingBytes());
        return references.parse(&self.input, local);
    }
};
