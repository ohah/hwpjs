const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const headers = @import("title_header.zig");
const texts = @import("chart_text.zig");
pub const Options = texts.Options;
pub const Body = texts.NullableText;
pub const Title = struct { header: headers.Header, body: Body, end: usize };

/// Selected body AFTER a validated Title header, through ChartSection only.
/// Does not consume the following List/Window candidate bytes. Strings borrow
/// retained input, raw fields are copied. Failure preserves reader; discard
/// both potentially changed tables.
pub fn readBodyObservedV1(reader: *Reader, types: *Types, objects: *Objects, options: Options) !Body {
    return texts.readNullableObservedWithObjects(reader, types, objects, options);
}

/// Inline selected Title v1 header plus the observed ChartText/Section body.
/// Same lifetime/failure contract as the body-only entry point.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, options: Options) !Title {
    var next = reader.*;
    const header = try headers.readObservedV1(&next, types, objects);
    const body = try readBodyObservedV1(&next, types, objects, options);
    reader.* = next;
    return .{ .header = header, .body = body, .end = next.offset };
}
