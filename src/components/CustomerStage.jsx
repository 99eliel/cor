import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage } from 'fabric';
import { getRegionAtPoint } from '../lib/geometry';
import { renderGarment } from '../lib/renderGarment';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    function attempt(useCors) {
      const image = new Image();
      if (useCors) image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => {
        if (useCors) attempt(false);
        else reject(new Error('Não foi possível carregar uma imagem.'));
      };
      image.src = url;
    }

    attempt(true);
  });
}

function dimensionsFor(image) {
  const ratio = Math.min(1, 1200 / image.naturalWidth);
  return {
    width: Math.round(image.naturalWidth * ratio),
    height: Math.round(image.naturalHeight * ratio),
  };
}

const CustomerStage = forwardRef(function CustomerStage({ garment, view, colorChoices, onRegionClick, onLogosChange }, ref) {
  const baseRef = useRef(null);
  const fabricElementRef = useRef(null);
  const fabricRef = useRef(null);
  const imagesRef = useRef({});
  const currentViewRef = useRef(view);

  function notifyLogos() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const logos = canvas.getObjects().map((object) => ({
      id: object.logoId,
      storageUrl: object.storageUrl,
      sourceUrl: object.sourceUrl || object.storageUrl,
      sourceName: object.sourceName || '',
      sourceType: object.sourceType || 'image',
      sourcePage: object.sourcePage || 1,
      sourcePageCount: object.sourcePageCount || 1,
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.logoView,
      },
    }));
    onLogosChange?.(logos);
  }

  function captureObject(object) {
    const canvas = fabricRef.current;
    if (!canvas || !object?.logoId) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    object.normX = (object.left ?? 0) / width;
    object.normY = (object.top ?? 0) / height;
    object.normScale = object.getScaledWidth() / width;
    notifyLogos();
  }

  function layoutObjects(targetView, width, height) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.getObjects().forEach((object) => {
      const visible = object.logoView === targetView;
      object.set({ visible, selectable: visible, evented: visible });
      if (!visible) return;
      object.set({
        left: object.normX * width,
        top: object.normY * height,
        angle: object.angle ?? 0,
      });
      object.scaleToWidth(object.normScale * width);
      object.setCoords();
    });
    canvas.requestRenderAll();
  }

  async function paint(targetView) {
    const url = garment.images?.[targetView];
    if (!url) return;
    const image = imagesRef.current[targetView] ?? await loadImage(url);
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
    canvas.on('object:modified', (event) => captureObject(event.target));

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    currentViewRef.current = view;
    paint(view);
  }, [view, garment.images?.front, garment.images?.back, garment.images?.combined]);

  useEffect(() => {
    paint(view);
  }, [colorChoices, garment.regions]);

  useImperativeHandle(ref, () => ({
    async addLogo(storageUrl, metadata = {}) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const imageElement = await loadImage(storageUrl);
      const object = new FabricImage(imageElement, {
        originX: 'center',
        originY: 'center',
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
        angle: 0,
        transparentCorners: false,
        cornerStyle: 'circle',
      });
      object.logoId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      object.storageUrl = storageUrl;
      object.sourceUrl = metadata.sourceUrl || storageUrl;
      object.sourceName = metadata.sourceName || '';
      object.sourceType = metadata.sourceType || 'image';
      object.sourcePage = metadata.sourcePage || 1;
      object.sourcePageCount = metadata.sourcePageCount || 1;
      object.logoView = metadata.targetView || currentViewRef.current;
      object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : 0.5;
      object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : 0.5;
      object.normScale = 0.2;
      object.set({
        left: object.normX * canvas.getWidth(),
        top: object.normY * canvas.getHeight(),
        visible: object.logoView === currentViewRef.current,
        selectable: object.logoView === currentViewRef.current,
        evented: object.logoView === currentViewRef.current,
      });
      object.scaleToWidth(canvas.getWidth() * object.normScale);
      object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
      canvas.add(object);
      if (object.logoView === currentViewRef.current) canvas.setActiveObject(object);
      canvas.requestRenderAll();
      notifyLogos();
      return object.logoId;
    },

    removeSelectedLogo() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyLogos();
      return true;
    },

    async exportView(targetView) {
      const url = garment.images?.[targetView];
      if (!url) return null;
      const image = imagesRef.current[targetView] ?? await loadImage(url);
      imagesRef.current[targetView] = image;
      const { width, height } = dimensionsFor(image);
      const result = document.createElement('canvas');
      result.width = width;
      result.height = height;
      renderGarment({ canvas: result, image, regions: garment.regions ?? [], view: targetView, colorChoices });
      const ctx = result.getContext('2d');
      const canvas = fabricRef.current;

      canvas.getObjects().filter((object) => object.logoView === targetView).forEach((object) => {
        const element = object.getElement();
        const drawWidth = object.normScale * width;
        const ratio = element.naturalHeight / element.naturalWidth;
        const drawHeight = drawWidth * ratio;
        ctx.save();
        ctx.translate(object.normX * width, object.normY * height);
        ctx.rotate(((object.angle ?? 0) * Math.PI) / 180);
        ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
      });

      return new Promise((resolve, reject) => {
        try {
          result.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Não foi possível gerar a imagem final.'));
          }, 'image/png', 0.96);
        } catch {
          reject(new Error('A imagem foi exibida, mas o navegador bloqueou a exportação final.')); 
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
