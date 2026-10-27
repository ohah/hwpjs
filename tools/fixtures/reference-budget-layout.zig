//! 정확 old 타입의 compile-time 크기 증거. 엔진 실행·현재 모델 비교를 하지 않는다.
const std = @import("std");
const model = @import("model/document.zig");
const Values = @import("hwp5/edit/created_table_values.zig").Values;
const Checkpoint = @import("hwp5/edit/editor_checkpoint.zig").Checkpoint;
// old editor_checkpoint/table_checkpoint의 private State 필드 선언과 정확히 같은 구조다.
const DocumentState = @import("hwp5/edit/editor_checkpoint.zig").ReferenceBudgetState;
const TableState = @import("hwp5/edit/table_checkpoint.zig").ReferenceBudgetState;
const types = .{ DocumentState, TableState, Values, model.Section, model.ParagraphResourceIntent, model.CharacterResourceIntent, @import("model/font_face_value.zig").Value, @import("model/form_values.zig").Value, model.PictureCurrentSize, model.TableCellSize, model.Paragraph, model.Token, model.CharacterRun, model.TextRange, model.FieldAttributes, model.FormulaResult };
const magic = "H5OLD455-LAYOUT-V1";
fn encode() [magic.len + types.len * 16 + 8]u8 {
    var bytes: [magic.len + types.len * 16 + 8]u8 = undefined;
    @memcpy(bytes[0..magic.len], magic);
    inline for (types, 0..) |T, i| {
        std.mem.writeInt(u64, bytes[magic.len + i * 16 ..][0..8], @sizeOf(T), .little);
        std.mem.writeInt(u64, bytes[magic.len + i * 16 + 8 ..][0..8], @alignOf(T), .little);
    }
    @memcpy(bytes[magic.len + types.len * 16 ..], "END455!!");
    return bytes;
}
export const h5_old455_layout = encode();
