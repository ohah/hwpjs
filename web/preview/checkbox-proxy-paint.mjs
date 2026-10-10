export function paintCheckBoxProxy(ctx, box, scrollTop) {
  const y = box.y - scrollTop;
  ctx.save();
  try {
    if (box.background !== null) {
      ctx.fillStyle = box.background ?? "#fff";
      ctx.fillRect(box.x, y, box.width, box.height);
    }
    ctx.strokeStyle = box.foreground ?? (box.checkBox.editable ? "#145b96" : "#777");
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, y + 0.5, box.width - 1, box.height - 1);
    if (box.checkBox.state === "CHECKED") {
      ctx.beginPath(); ctx.moveTo(box.x + box.width * .2, y + box.height * .5);
      ctx.lineTo(box.x + box.width * .43, y + box.height * .73);
      ctx.lineTo(box.x + box.width * .8, y + box.height * .25); ctx.stroke();
    } else if (box.checkBox.state === "INDETERMINATE") {
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(box.x + box.width * .2, y + box.height * .4, box.width * .6, box.height * .2);
    }
  } finally { ctx.restore(); }
}
