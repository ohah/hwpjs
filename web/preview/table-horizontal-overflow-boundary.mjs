import { hwpUnitPixels } from "./hwp-units.mjs";

// COLUMN is an anchor, not an absolute-size clamp. Narrow columns remain scoped.
function declaredFullWidthColumnOverflow(table, reference, measuredWidth) {
  const source = table?.sourceGeometry, geometry = source?.geometry, column = reference?.column, page = reference?.page;
  return source?.horizontal_relative === 2 && geometry?.treat_as_character === false && geometry.width_relative === 4
    && source.flow_with_text === true && source.allow_overlap === false
    && column && page && [column.x, column.width, page.x, page.width].every(Number.isFinite)
    && column.width > 0 && column.x === page.x && column.width === page.width
    && Number.isSafeInteger(geometry.width) && geometry.width > 0 && geometry.width <= 0xffffffff
    && Number.isFinite(measuredWidth) && measuredWidth > 0
    && hwpUnitPixels(geometry.width) > column.width && measuredWidth <= hwpUnitPixels(geometry.width) + 1e-8;
}

// An absolute source table can fit a full-page column while its declared outer
// margins do not. Alignment/offset remain source-owned; paper is the clip bound.
function declaredColumnMarginOverflow(table, reference, measuredWidth, margins) {
  const source=table?.sourceGeometry,g=source?.geometry,column=reference?.column,page=reference?.page;
  return source?.horizontal_relative===2&&g?.treat_as_character===false&&g.width_relative===4
    &&source.flow_with_text===true&&source.allow_overlap===false&&[0,1,2].includes(source.horizontal_alignment)
    &&column&&page&&[column.x,column.width,page.x,page.width].every(Number.isFinite)&&column.width>0
    &&column.x===page.x&&column.width===page.width
    &&Number.isSafeInteger(g.width)&&g.width>0&&g.width<=0xffffffff
    &&Number.isFinite(measuredWidth)&&measuredWidth>0&&measuredWidth<=hwpUnitPixels(g.width)+1e-8
    &&[margins?.left,margins?.right].every(value=>Number.isFinite(value)&&value>=0)
    &&hwpUnitPixels(g.width)<=column.width+1e-8&&hwpUnitPixels(g.width)+margins.left+margins.right>column.width;
}

// Source-relative horizontal overflow uses one boundary policy in both planners.
export function tableHorizontalOverflowBoundary(table,reference,measuredWidth,margins){
  const source=table?.sourceGeometry,geometry=source?.geometry,column=reference?.column;
  const outerOnly=source?.horizontal_relative===2&&source.horizontal_alignment===0&&geometry?.horizontal_offset===0&&column
    &&hwpUnitPixels(geometry.width)<=column.width+1e-8&&measuredWidth<=column.width+1e-8
    &&measuredWidth+margins.left+margins.right>column.width;
  return source?.horizontal_relative===3||source?.vertical_relative===1||outerOnly||declaredFullWidthColumnOverflow(table,reference,measuredWidth)
    ||declaredColumnMarginOverflow(table,reference,measuredWidth,margins)?reference?.paper??column:column;
}

export function tableHorizontalBoundsContain(table,rectangle,reference,margins,boundary){
  const source=table?.sourceGeometry;
  if(!rectangle||![rectangle.x,rectangle.width,rectangle.x+rectangle.width].every(Number.isFinite)||rectangle.width<=0)return false;
  const left=source?.horizontal_relative===3||source?.vertical_relative===1
    ||boundary===reference?.paper&&(declaredFullWidthColumnOverflow(table,reference,rectangle.width)
      ||declaredColumnMarginOverflow(table,reference,rectangle.width,margins))?boundary:reference?.column;
  if(![left,boundary].every(box=>box&&[box.x,box.width,box.x+box.width].every(Number.isFinite)&&box.width>0))return false;
  if(source?.horizontal_relative===3){
    const paper=reference?.paper??boundary;
    return paper&&[paper.x,paper.width,paper.x+paper.width].every(Number.isFinite)&&paper.width>0
      &&rectangle.x>=boundary.x&&rectangle.x+rectangle.width<=boundary.x+boundary.width+1e-8
      &&rectangle.x-margins.left>=paper.x&&rectangle.x+rectangle.width+margins.right<=paper.x+paper.width+1e-8;
  }
  return rectangle.x-margins.left>=left.x&&rectangle.x+rectangle.width+margins.right<=boundary.x+boundary.width;
}
