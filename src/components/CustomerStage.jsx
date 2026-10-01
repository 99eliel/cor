import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage, IText } from 'fabric';
import { getRegionAtPoint } from '../lib/geometry';
import { renderGarment } from '../lib/renderGarment';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem com segurança para exportação. Verifique o CORS do Cloud Storage.'));
    image.src = url;
  });
}

function loadDisplayImage(url) {
  return loadImage(url).catch(() => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da peça.'));
    image.src = url;
  }));
}

function dimensionsFor(image) {
  const ratio = Math.min(1, 1200 / image.naturalWidth);
  return {
    width: Math.round(image.naturalWidth * ratio),
    height: Math.round(image.naturalHeight * ratio),
  };
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

const CustomerStage = forwardRef(function CustomerStage({
  garment,
  view,
  colorChoices,
  onRegionClick,
  onLogosChange,
  onTextsChange,
  onHistoryAction,
}, ref) {
  const baseRef = useRef(null);
  const fabricElementRef = useRef(null);
  const fabricRef = useRef(null);
  const imagesRef = useRef({});
  const currentViewRef = useRef(view);
  const historyRef = useRef({ entries: [[]], index: 0, restoring: false });

  function serializeLogo(object) {
    return {
      id: object.logoId,
      type: 'logo',
      storageUrl: object.storageUrl,
      sourceUrl: object.sourceUrl || object.storageUrl,
      sourceName: object.sourceName || '',
      sourceType: object.sourceType || 'image',
      sourcePage: object.sourcePage || 1,
      sourcePageCount: object.sourcePageCount || 1,
      originalUrl: object.originalUrl || object.sourceUrl || object.storageUrl,
      processedUrl: object.processedUrl || '',
      backgroundRemoved: Boolean(object.backgroundRemoved),
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.designView,
      },
    };
  }

  function serializeText(object) {
    return {
      id: object.textId,
      type: 'text',
      text: object.text || '',
      color: object.fill || '#111827',
      fontFamily: object.fontFamily || 'Arial',
      fontWeight: object.fontWeight || '700',
      fontStyle: object.fontStyle || 'normal',
      fontSize: Number(object.fontSize) || 56,
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.designView,
      },
    };
  }

  function designObjects() {
    const canvas = fabricRef.current;
    return canvas ? canvas.getObjects().filter((object) => object.logoId || object.textId) : [];
  }

  function snapshotObjects() {
    return designObjects().map((object) => (object.logoId ? serializeLogo(object) : serializeText(object)));
  }

  function notifyDesign() {
    const objects = designObjects();
    onLogosChange?.(objects.filter((object) => object.logoId).map(serializeLogo));
    onTextsChange?.(objects.filter((object) => object.textId).map(serializeText));
  }

  function commitHistory() {
    const history = historyRef.current;
    if (history.restoring) return;
    const snapshot = snapshotObjects();
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(snapshot);
    history.index = history.entries.length - 1;
    onHistoryAction?.('stage');
  }

  function captureObject(object, shouldCommit = false) {
    const canvas = fabricRef.current;
    if (!canvas || !(object?.logoId || object?.textId)) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    object.normX = (object.left ?? 0) / width;
    object.normY = (object.top ?? 0) / height;
    object.normScale = object.getScaledWidth() / width;
    notifyDesign();
    if (shouldCommit) commitHistory();
  }

  function layoutObjects(targetView, width, height) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    designObjects().forEach((object) => {
      const visible = object.designView === targetView;
      object.set({ visible, selectable: visible, evented: visible });
      if (!visible) return;
      object.set({
        left: object.normX * width,
        top: object.normY * height,
        angle: object.angle ?? 0,
      });
      object.scaleToWidth(Math.max(18, object.normScale * width));
      object.setCoords();
    });
    canvas.requestRenderAll();
  }

  async function paint(targetView) {
    const url = garment.images?.[targetView];
    if (!url) return;
    const image = imagesRef.current[targetView] ?? await loadDisplayImage(url);
    imagesRef.current[targetView] = image;
    if (targetView !== currentViewRef.current) return;

    const { width, height } = dimensionsFor(image);
    const base = baseRef.current;
    base.width = width;
    base.height = height;
    renderGarment({ canvas: base, image, regions: garment.regions ?? [], view: targetView, colorChoices });

    const fabricCanvas = fabricRef.current;
    if (fabricCanvas) {
      fabricCanvas.setDimensions({ width, height });
      layoutObjects(targetView, width, height);
    }
  }

  async function addLogoObject(storageUrl, metadata = {}, { commit = true } = {}) {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const source = metadata.processingSource || storageUrl;
    const imageElement = await loadDisplayImage(source);
    const object = new FabricImage(imageElement, {
      originX: 'center',
      originY: 'center',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      angle: Number(metadata.rotation ?? metadata.position?.rotation) || 0,
      transparentCorners: false,
      cornerStyle: 'circle',
      cornerColor: '#0b5d92',
      borderColor: '#0b5d92',
    });
    object.logoId = metadata.id || randomId('logo');
    object.storageUrl = storageUrl;
    object.sourceUrl = metadata.sourceUrl || storageUrl;
    object.sourceName = metadata.sourceName || '';
    object.sourceType = metadata.sourceType || 'image';
    object.sourcePage = metadata.sourcePage || 1;
    object.sourcePageCount = metadata.sourcePageCount || 1;
    object.originalUrl = metadata.originalUrl || metadata.sourceUrl || storageUrl;
    object.processedUrl = metadata.processedUrl || '';
    object.backgroundRemoved = Boolean(metadata.backgroundRemoved);
    object.processingSource = source;
    object.processingSourceOwned = Boolean(metadata.processingSourceOwned);
    object.designView = metadata.targetView || metadata.position?.view || currentViewRef.current;
    object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : Number(metadata.position?.x) || 0.5;
    object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : Number(metadata.position?.y) || 0.5;
    object.normScale = Number(metadata.position?.scale) || Number(metadata.normScale) || 0.2;
    object.set({
      left: object.normX * canvas.getWidth(),
      top: object.normY * canvas.getHeight(),
      visible: object.designView === currentViewRef.current,
      selectable: object.designView === currentViewRef.current,
      evented: object.designView === currentViewRef.current,
    });
    object.scaleToWidth(canvas.getWidth() * object.normScale);
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    canvas.add(object);
    if (object.designView === currentViewRef.current) canvas.setActiveObject(object);
    canvas.requestRenderAll();
    notifyDesign();
    if (commit) commitHistory();
    return object.logoId;
  }

  function addTextObject(text, metadata = {}, { commit = true } = {}) {
    const canvas = fabricRef.current;
    const cleanText = String(text ?? metadata.text ?? '').trim();
    if (!canvas || !cleanText) return null;
    const object = new IText(cleanText, {
      originX: 'center',
      originY: 'center',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      angle: Number(metadata.rotation ?? metadata.position?.rotation) || 0,
      fill: metadata.color || '#111827',
      fontFamily: metadata.fontFamily || 'Arial',
      fontWeight: metadata.fontWeight || '700',
      fontStyle: metadata.fontStyle || 'normal',
      fontSize: Number(metadata.fontSize) || 56,
      transparentCorners: false,
      cornerStyle: 'circle',
      cornerColor: '#0b5d92',
      borderColor: '#0b5d92',
      editingBorderColor: '#1d8bd1',
    });
    object.textId = metadata.id || randomId('text');
    object.designView = metadata.targetView || metadata.position?.view || currentViewRef.current;
    object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : Number(metadata.position?.x) || 0.5;
    object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : Number(metadata.position?.y) || 0.5;
    object.normScale = Number(metadata.position?.scale) || 0.22;
    object.set({
      left: object.normX * canvas.getWidth(),
      top: object.normY * canvas.getHeight(),
      visible: object.designView === currentViewRef.current,
      selectable: object.designView === currentViewRef.current,
      evented: object.designView === currentViewRef.current,
    });
    const targetWidth = canvas.getWidth() * object.normScale;
    if (object.width > 0) object.scaleToWidth(targetWidth);
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    canvas.add(object);
    if (object.designView === currentViewRef.current) canvas.setActiveObject(object);
    canvas.requestRenderAll();
    notifyDesign();
    if (commit) commitHistory();
    return object.textId;
  }

  function clearObjects({ notify = true } = {}) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    designObjects().forEach((object) => {
      if (object.processingSourceOwned && object.processingSource?.startsWith('blob:')) URL.revokeObjectURL(object.processingSource);
      canvas.remove(object);
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    if (notify) notifyDesign();
  }

  async function restoreSnapshot(snapshot, { resetHistory = false } = {}) {
    const history = historyRef.current;
    history.restoring = true;
    clearObjects({ notify: false });
    try {
      for (const item of snapshot || []) {
        if (item.type === 'text') addTextObject(item.text, item, { commit: false });
        else {
          const url = item.processedUrl || item.storageUrl || item.sourceUrl;
          if (url) await addLogoObject(url, item, { commit: false });
        }
      }
      notifyDesign();
      if (resetHistory) historyRef.current = { entries: [snapshotObjects()], index: 0, restoring: false };
    } finally {
      historyRef.current.restoring = false;
    }
  }

  useEffect(() => {
    const canvas = new Canvas(fabricElementRef.current, {
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: true,
    });
    fabricRef.current = canvas;

    function onMouseDown(event) {
      if (event.target) return;
      const pointer = canvas.getScenePoint(event.e);
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      const hit = getRegionAtPoint(
        garment.regions ?? [],
        { x: pointer.x / width, y: pointer.y / height },
        currentViewRef.current,
      );
      if (hit) onRegionClick?.(hit);
    }

    canvas.on('mouse:down', onMouseDown);
    canvas.on('object:modified', (event) => captureObject(event.target, true));
    canvas.on('text:changed', (event) => captureObject(event.target, true));

    return () => {
      clearObjects({ notify: false });
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    currentViewRef.current = view;
    paint(view).catch((err) => console.error(err));
  }, [view, garment.images?.front, garment.images?.back, garment.images?.combined]);

  useEffect(() => {
    paint(view).catch((err) => console.error(err));
  }, [colorChoices, garment.regions]);

  useImperativeHandle(ref, () => ({
    addLogo: addLogoObject,
    addText(text, metadata = {}) {
      return addTextObject(text, metadata);
    },
    getSelectedLogo() {
      const active = fabricRef.current?.getActiveObject();
      if (!active?.logoId) return null;
      return {
        ...serializeLogo(active),
        processingSource: active.processedUrl || active.processingSource || active.originalUrl || active.sourceUrl || active.storageUrl,
      };
    },
    getSelectedItem() {
      const active = fabricRef.current?.getActiveObject();
      if (!active) return null;
      if (active.logoId) return serializeLogo(active);
      if (active.textId) return serializeText(active);
      return null;
    },
    updateSelectedText(metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.textId) return false;
      if (metadata.text !== undefined) active.set('text', String(metadata.text));
      if (metadata.color !== undefined) active.set('fill', metadata.color);
      if (metadata.fontWeight !== undefined) active.set('fontWeight', metadata.fontWeight);
      if (metadata.fontFamily !== undefined) active.set('fontFamily', metadata.fontFamily);
      active.setCoords();
      canvas.requestRenderAll();
      captureObject(active, true);
      return true;
    },
    async replaceSelectedLogoImage(storageUrl, metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      const imageElement = await loadDisplayImage(metadata.processingSource || storageUrl);
      active.setElement(imageElement);
      active.storageUrl = storageUrl;
      active.processedUrl = metadata.processedUrl || storageUrl;
      active.backgroundRemoved = metadata.backgroundRemoved ?? true;
      if (metadata.originalUrl) active.originalUrl = metadata.originalUrl;
      if (metadata.sourceUrl) active.sourceUrl = metadata.sourceUrl;
      if (metadata.sourceName) active.sourceName = metadata.sourceName;
      if (metadata.processingSource) {
        if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
        active.processingSource = metadata.processingSource;
        active.processingSourceOwned = Boolean(metadata.processingSourceOwned);
      }
      active.scaleToWidth(active.normScale * canvas.getWidth());
      active.setCoords();
      canvas.setActiveObject(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    removeSelectedLogo() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    removeSelectedItem() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !(active?.logoId || active?.textId)) return false;
      if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    clearLogos() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().filter((object) => object.logoId).forEach((object) => canvas.remove(object));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
    },
    clearDesignItems() {
      clearObjects();
      commitHistory();
    },
    getDesignState() {
      return {
        logos: designObjects().filter((object) => object.logoId).map(serializeLogo),
        texts: designObjects().filter((object) => object.textId).map(serializeText),
      };
    },
    async restoreDesignState(state = {}, options = {}) {
      const snapshot = [
        ...(state.logos || []).map((item) => ({ ...item, type: 'logo' })),
        ...(state.texts || []).map((item) => ({ ...item, type: 'text' })),
      ];
      await restoreSnapshot(snapshot, { resetHistory: options.resetHistory !== false });
    },
    resetHistory() {
      historyRef.current = { entries: [snapshotObjects()], index: 0, restoring: false };
    },
    async undo() {
      const history = historyRef.current;
      if (history.index <= 0) return false;
      history.index -= 1;
      await restoreSnapshot(history.entries[history.index]);
      return true;
    },
    async redo() {
      const history = historyRef.current;
      if (history.index >= history.entries.length - 1) return false;
      history.index += 1;
      await restoreSnapshot(history.entries[history.index]);
      return true;
    },
    async exportView(targetView) {
      const url = garment.images?.[targetView];
      if (!url) return null;
      const image = await loadImage(url);
      const { width, height } = dimensionsFor(image);
      const result = document.createElement('canvas');
      result.width = width;
      result.height = height;
      renderGarment({ canvas: result, image, regions: garment.regions ?? [], view: targetView, colorChoices });
      const ctx = result.getContext('2d');

      for (const object of designObjects().filter((item) => item.designView === targetView)) {
        if (object.logoId) {
          const source = object.processedUrl || object.processingSource || object.storageUrl || object.sourceUrl;
          const element = source ? await loadImage(source) : object.getElement();
          const drawWidth = object.normScale * width;
          const ratio = element.naturalHeight / element.naturalWidth;
          const drawHeight = drawWidth * ratio;
          ctx.save();
          ctx.translate(object.normX * width, object.normY * height);
          ctx.rotate(((object.angle ?? 0) * Math.PI) / 180);
          ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          ctx.restore();
        } else if (object.textId) {
          const serialized = serializeText(object);
          const desiredWidth = Math.max(20, serialized.position.scale * width);
          const baseFontSize = Math.max(12, serialized.fontSize);
          ctx.save();
          ctx.translate(serialized.position.x * width, serialized.position.y * height);
          ctx.rotate(((serialized.position.rotation || 0) * Math.PI) / 180);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = serialized.color;
          ctx.font = `${serialized.fontStyle} ${serialized.fontWeight} ${baseFontSize}px ${serialized.fontFamily}`;
          const measured = Math.max(1, ctx.measureText(serialized.text).width);
          const scale = desiredWidth / measured;
          ctx.scale(scale, scale);
          ctx.fillText(serialized.text, 0, 0);
          ctx.restore();
        }
      }

      return new Promise((resolve, reject) => {
        try {
          result.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Não foi possível gerar a imagem final.'));
          }, 'image/png', 0.96);
        } catch (error) {
          reject(new Error(`A exportação foi bloqueada por uma imagem sem permissão CORS. ${error?.message || ''}`.trim()));
        }
      });
    },
  }));

  return (
    <div className="customer-stage">
      <canvas ref={baseRef} className="customer-base-canvas" />
      <canvas ref={fabricElementRef} className="customer-fabric-canvas" />
    </div>
  );
});

export default CustomerStage;