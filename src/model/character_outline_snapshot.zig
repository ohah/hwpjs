pub const Row = struct { id: u32, state: enum { absent, none, solid, other, unknown }, rawKind: ?u32 };
