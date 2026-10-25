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
    if (box.checkBox.kind === "radio_button") {
      const x = box.x + box.width / 2, middle = y + box.height / 2, radius = Math.max(0, Math.min(box.width, box.height) / 2 - 1);
      ctx.beginPath(); ctx.arc(x, middle, radius, 0, Math.PI * 2); ctx.stroke();
      if (box.checkBox.state === "CHECKED") { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, middle, radius * .5, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
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
