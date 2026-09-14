import { useEffect, useMemo, useRef, useState } from 'react';
import { distancePixels, getRegionAtPoint, normalizedPointFromEvent } from '../lib/geometry';
import { findEdgeHit, findVertexHit, insertVertex, moveVertex, removeVertex } from '../lib/editorHit';
import { drawEditableVertices, renderGarment } from '../lib/renderGarment';

export default function GarmentEditorCanvas({
  imageUrl,
  view,
  regions,
  setRegions,
  selectedRegionId,
  mode,
  visibleIds,
  previewColors,
  onSelectRegion,
  onPolygonClosed,
  zoom,
  setZoom,
}) {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [draggingVertex, setDraggingVertex] = useState(null);

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  useEffect(() => {
    setCurrentPolygon([]);
    setSelectedVertex(null);
  }, [selectedRegionId, view, mode]);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return undefined;
    }
    const nextImage = new Image();
    nextImage.crossOrigin = 'anonymous';
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = imageUrl;
    return () => { nextImage.onload = null; };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const maxWidth = 1200;
    const ratio = Math.min(1, maxWidth / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    renderGarment({
      canvas,
      image,
      regions,
      view,
      colorChoices: mode === 'preview' ? previewColors : {},
      visibleRegionIds: visibleIds,
      highlightRegionId: selectedRegionId,
      showEditorOverlay: mode !== 'preview',
    });
    if (mode === 'draw' || mode === 'edit') {
      drawEditableVertices({ canvas, region: selectedRegion, currentPolygon, hoverPoint, selectedVertex });
    }
  }, [image, regions, view, mode, visibleIds, previewColors, selectedRegionId, selectedRegion, currentPolygon, hoverPoint, selectedVertex]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Enter' && mode === 'draw' && currentPolygon.length >= 3) {
        event.preventDefault();
        finishPolygon();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'edit' && selectedVertex && selectedRegionId) {
        event.preventDefault();
        setRegions((items) => removeVertex(items, selectedRegionId, selectedVertex));
        setSelectedVertex(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function finishPolygon() {
    if (currentPolygon.length < 3 || !selectedRegionId) return;
    const polygon = currentPolygon.map((point) => ({ x: point.x, y: point.y }));
    setRegions((items) => items.map((region) => (
      region.id === selectedRegionId
        ? { ...region, polygons: [...(region.polygons ?? []), polygon] }
        : region
    )));
    setCurrentPolygon([]);
    setHoverPoint(null);
    onPolygonClosed?.();
  }

  function handleClick(event) {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const point = normalizedPointFromEvent(event, canvas);

    if (mode === 'draw' && selectedRegionId) {
      if (currentPolygon.length >= 3 && distancePixels(point, currentPolygon[0], canvas.width, canvas.height) <= 10) {
        finishPolygon();
        return;
      }
      setCurrentPolygon((items) => [...items, point]);
      return;
    }

    if (mode === 'preview') {
      const hit = getRegionAtPoint(regions.filter((region) => visibleIds.has(region.id)), point, view);
      if (hit) onSelectRegion?.(hit.id);
    }
  }

  function handlePointerDown(event) {
    if (mode !== 'edit' || !selectedRegion) return;
    const canvas = canvasRef.current;
    const point = normalizedPointFromEvent(event, canvas);
    const vertex = findVertexHit(selectedRegion, point, canvas.width, canvas.height, 10);
    if (vertex) {
      setSelectedVertex(vertex);
      setDraggingVertex(vertex);
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    const edge = findEdgeHit(selectedRegion, point, canvas.width, canvas.height, 7);
    if (edge) {
      const selection = { polygonIndex: edge.polygonIndex, vertexIndex: edge.edgeIndex + 1 };
      setRegions((items) => insertVertex(items, selectedRegion.id, edge, point));
      setSelectedVertex(selection);
    }
  }

  function handlePointerMove(event) {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const point = normalizedPointFromEvent(event, canvas);
    if (mode === 'draw') setHoverPoint(point);
    if (mode === 'edit' && draggingVertex && selectedRegionId) {
      setRegions((items) => moveVertex(items, selectedRegionId, draggingVertex, point));
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((value) => Math.min(3, Math.max(0.5, value + (event.deltaY < 0 ? 0.1 : -0.1))));
  }

  if (!imageUrl) {
    return <div className="canvas-placeholder"><strong>Envie a foto desta vista</strong><span>Frente e costas podem ter imagens diferentes.</span></div>;
  }

  return (
    <div className="editor-scroll" onWheel={handleWheel}>
      <div className="editor-zoom-stage" style={{ width: `${zoom * 100}%` }}>
        <canvas
          ref={canvasRef}
          className={`garment-editor-canvas mode-${mode}`}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDraggingVertex(null)}
          onPointerLeave={() => { setDraggingVertex(null); setHoverPoint(null); }}
        />
      </div>
      {mode === 'draw' && <div className="canvas-hint">Clique para criar os vértices. Feche clicando perto do primeiro ponto ou pressione Enter.</div>}
      {mode === 'edit' && <div className="canvas-hint">Arraste pontos. Clique numa aresta para adicionar um ponto. Delete remove o ponto selecionado.</div>}
    </div>
  );
}
