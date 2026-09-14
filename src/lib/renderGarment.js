function drawPolygon(ctx, polygon, width, height) {
  if (!polygon?.length) return;
  ctx.beginPath();
  polygon.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function createBlurredMask(width, height, polygons, blurPx = 1.5) {
  const hardMask = document.createElement('canvas');
  hardMask.width = width;
  hardMask.height = height;
  const hardCtx = hardMask.getContext('2d');
  hardCtx.fillStyle = '#fff';

  polygons.forEach((polygon) => {
    drawPolygon(hardCtx, polygon, width, height);
    hardCtx.fill();
  });

  if (!blurPx) return hardMask;

  const softMask = document.createElement('canvas');
  softMask.width = width;
  softMask.height = height;
  const softCtx = softMask.getContext('2d');
  softCtx.filter = `blur(${blurPx}px)`;
  softCtx.drawImage(hardMask, 0, 0);
  softCtx.filter = 'none';
  return softMask;
}

function createMaskedSolidLayer(width, height, mask, color) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');
  layerCtx.fillStyle = color;
  layerCtx.fillRect(0, 0, width, height);
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
  return layer;
}

function createMaskedDetailLayer(width, height, mask, image) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');

  // Recupera apenas luz/sombra/textura da foto, sem trazer a cor original de volta.
  layerCtx.filter = 'grayscale(1) contrast(1.18)';
  layerCtx.drawImage(image, 0, 0, width, height);
  layerCtx.filter = 'none';
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = 'source-over';
  return layer;
}

function colorBrightness(color) {
  const value = String(color ?? '').trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  const full = /^#([0-9a-f]{6})$/i.exec(value);

  let hex;
  if (short) hex = short[1].split('').map((char) => char + char).join('');
  else if (full) hex = full[1];
  else return 0.5;

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function recolorRegion(ctx, image, region, chosenColor, width, height) {
  const mask = createBlurredMask(width, height, region.polygons ?? [], 1.5);
  const brightness = colorBrightness(chosenColor);

  // Quanto mais clara for a cor desejada, mais neutralizamos/clareamos a base.
  // Isso permite, por exemplo, transformar azul-marinho em amarelo claro.
  const liftAlpha = Math.min(0.82, 0.08 + brightness * 0.78);
  const whiteLayer = createMaskedSolidLayer(width, height, mask, '#ffffff');

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = liftAlpha;
  ctx.drawImage(whiteLayer, 0, 0);
  ctx.restore();

  // Depois do clareamento, a nova cor passa a dominar a região.
  const colorLayer = createMaskedSolidLayer(width, height, mask, chosenColor);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(colorLayer, 0, 0);
  ctx.restore();

  // Reintroduz dobras, costuras e volume usando somente luminância da foto original.
  const detailLayer = createMaskedDetailLayer(width, height, mask, image);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(detailLayer, 0, 0);
  ctx.restore();
}

export function renderGarment({
  canvas,
  image,
  regions,
  view,
  colorChoices = {},
  visibleRegionIds = null,
  highlightRegionId = null,
  showEditorOverlay = false,
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(image, 0, 0, width, height);

  const activeRegions = regions
    .filter((region) => region.view === view)
    .filter((region) => !visibleRegionIds || visibleRegionIds.has(region.id))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  activeRegions.forEach((region) => {
    const chosenColor = colorChoices[region.id];
    if (!chosenColor) return;
    recolorRegion(ctx, image, region, chosenColor, width, height);
  });

  if (showEditorOverlay) {
    activeRegions.forEach((region) => {
      region.polygons?.forEach((polygon) => {
        drawPolygon(ctx, polygon, width, height);
        ctx.save();
        ctx.fillStyle = region.id === highlightRegionId
          ? 'rgba(37, 99, 235, 0.18)'
          : 'rgba(17, 24, 39, 0.06)';
        ctx.strokeStyle = region.id === highlightRegionId ? '#2563eb' : 'rgba(17, 24, 39, 0.45)';
        ctx.lineWidth = region.id === highlightRegionId ? 2.5 : 1.25;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    });
  }
}

export function drawEditableVertices({ canvas, region, currentPolygon = [], hoverPoint = null, selectedVertex = null }) {
  if (!canvas || !region) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  region.polygons?.forEach((polygon, polygonIndex) => {
    polygon.forEach((point, vertexIndex) => {
      const x = point.x * width;
      const y = point.y * height;
      ctx.beginPath();
      ctx.arc(x, y, selectedVertex?.polygonIndex === polygonIndex && selectedVertex?.vertexIndex === vertexIndex ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2563eb';
      ctx.stroke();
    });
  });

  if (currentPolygon.length) {
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    currentPolygon.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (hoverPoint) ctx.lineTo(hoverPoint.x * width, hoverPoint.y * height);
    ctx.stroke();
    ctx.setLineDash([]);

    currentPolygon.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}
