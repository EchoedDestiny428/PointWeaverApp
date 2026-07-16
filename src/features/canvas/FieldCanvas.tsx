import React, { useEffect, useCallback } from 'react';
import { FIELD_WIDTH, FIELD_HEIGHT, PIXELS_PER_METER, POINT_RADIUS, HEADING_LINE_LENGTH } from '../../constants';
import type { PathDefinition, PathPoint, SimulatedPose } from '../../types';
import { distToSegmentSquared } from '../../utils/math';

export interface FieldCanvasProps {
  projectDir: string | null;
  currentPathName: string | null;
  currentPath: PathDefinition;
  selectedIndex: number | null;
  
  bgImgObj: HTMLImageElement | null;
  bgWidth: number;
  bgHeight: number;
  bgOffsetX: number;
  bgOffsetY: number;
  isEditingBg: boolean;
  
  viewOffset: { x: number, y: number };
  zoomLevel: number;
  isPanning: boolean;
  dragMode: 'position' | 'heading' | null;
  
  bgDragMode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | null;
  bgDragStart: { x: number, y: number, bgX: number, bgY: number, bgW: number, bgH: number } | null;
  
  playbackState: 'stopped' | 'playing' | 'paused';
  playbackTimeRef: React.MutableRefObject<number>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  
  setZoomLevel: (z: number) => void;
  setViewOffset: React.Dispatch<React.SetStateAction<{ x: number, y: number }>>;
  setIsPanning: (p: boolean) => void;
  setDragMode: (m: 'position' | 'heading' | null) => void;
  setBgDragMode: (m: 'move' | 'tl' | 'tr' | 'bl' | 'br' | null) => void;
  setBgDragStart: (m: any) => void;
  setSelectedIndex: (i: number | null) => void;
  
  updateLocalPath: (newDef: PathDefinition, pushHistory?: boolean, forceHistory?: boolean, actionType?: string | null) => void;
  pushToHistory: (force?: boolean, actionType?: string | null) => void;
  
  setBgOffsetX: (v: number) => void;
  setBgOffsetY: (v: number) => void;
  setBgWidth: (v: number) => void;
  setBgHeight: (v: number) => void;
  
  updateSelectedPoint: (field: keyof PathPoint, value: any, forceHistory?: boolean, actionType?: string | null) => void;
  getInterpolatedPose: (t: number) => SimulatedPose | null;
  
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  
  drawCanvasRef: React.MutableRefObject<(() => void) | null>;
}

export const FieldCanvas: React.FC<FieldCanvasProps> = ({
  projectDir, currentPathName, currentPath, selectedIndex,
  bgImgObj, bgWidth, bgHeight, bgOffsetX, bgOffsetY, isEditingBg,
  viewOffset, zoomLevel, isPanning, dragMode, bgDragMode, bgDragStart,
  playbackState, playbackTimeRef, canvasRef,
  setZoomLevel, setViewOffset, setIsPanning, setDragMode, setBgDragMode, setBgDragStart, setSelectedIndex,
  updateLocalPath, pushToHistory, setBgOffsetX, setBgOffsetY, setBgWidth, setBgHeight,
  updateSelectedPoint, getInterpolatedPose, handleDrop, handleDragOver, drawCanvasRef
}) => {

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(viewOffset.x, canvas.height + viewOffset.y);
    ctx.scale(zoomLevel, -zoomLevel);

    if (bgImgObj) {
      ctx.save();
      ctx.scale(1, -1);
      const drawX = bgOffsetX * PIXELS_PER_METER;
      const drawY = -(bgOffsetY + bgHeight) * PIXELS_PER_METER;
      const drawW = bgWidth * PIXELS_PER_METER;
      const drawH = bgHeight * PIXELS_PER_METER;
      ctx.drawImage(bgImgObj, drawX, drawY, drawW, drawH);
      ctx.restore();

      if (isEditingBg) {
        ctx.save();
        ctx.translate(bgOffsetX * PIXELS_PER_METER, bgOffsetY * PIXELS_PER_METER);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / zoomLevel;
        ctx.setLineDash([5 / zoomLevel, 5 / zoomLevel]);
        ctx.strokeRect(0, 0, bgWidth * PIXELS_PER_METER, bgHeight * PIXELS_PER_METER);
        ctx.setLineDash([]);

        const handleSize = 10 / zoomLevel;
        ctx.fillStyle = '#f59e0b';
        const corners = [
          { x: 0, y: 0 },
          { x: bgWidth * PIXELS_PER_METER, y: 0 },
          { x: 0, y: bgHeight * PIXELS_PER_METER },
          { x: bgWidth * PIXELS_PER_METER, y: bgHeight * PIXELS_PER_METER }
        ];
        corners.forEach(c => {
          ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        });
        ctx.restore();
      }
    }

    const minX = -viewOffset.x / (zoomLevel * PIXELS_PER_METER);
    const maxX = (canvas.width - viewOffset.x) / (zoomLevel * PIXELS_PER_METER);
    const minY = viewOffset.y / (zoomLevel * PIXELS_PER_METER);
    const maxY = (canvas.height + viewOffset.y) / (zoomLevel * PIXELS_PER_METER);

    const startX = Math.floor(minX);
    const endX = Math.ceil(maxX);
    const startY = Math.floor(minY);
    const endY = Math.ceil(maxY);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x++) {
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, startY * PIXELS_PER_METER); ctx.lineTo(x * PIXELS_PER_METER, endY * PIXELS_PER_METER); ctx.stroke();
    }
    for (let y = startY; y <= endY; y++) {
      ctx.beginPath(); ctx.moveTo(startX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.lineTo(endX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    for (let x = startX; x <= endX; x++) {
      if (x % 5 !== 0) continue;
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, startY * PIXELS_PER_METER); ctx.lineTo(x * PIXELS_PER_METER, endY * PIXELS_PER_METER); ctx.stroke();
    }
    for (let y = startY; y <= endY; y++) {
      if (y % 5 !== 0) continue;
      ctx.beginPath(); ctx.moveTo(startX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.lineTo(endX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.stroke();
    }

    const points = currentPath.points || [];

    if (points.length > 1) {
      ctx.shadowColor = 'rgba(14, 165, 233, 0.5)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const px = points[i].x * PIXELS_PER_METER;
        const py = points[i].y * PIXELS_PER_METER;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const px = p.x * PIXELS_PER_METER;
      const py = p.y * PIXELS_PER_METER;

      const isSelected = i === selectedIndex;

      const exitRange = p.params?.earlyExitRange ?? currentPath.params?.earlyExitRange;
      if (exitRange != null) {
        ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(63, 63, 70, 0.1)';
        ctx.strokeStyle = isSelected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(63, 63, 70, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, exitRange * PIXELS_PER_METER, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (p.theta != null) {
        ctx.strokeStyle = isSelected ? '#10b981' : '#a1a1aa';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        const rad = p.theta * (Math.PI / 180);
        const tipX = px + Math.cos(rad) * HEADING_LINE_LENGTH;
        const tipY = py + Math.sin(rad) * HEADING_LINE_LENGTH;
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#10b981' : '#a1a1aa';
        ctx.beginPath();
        ctx.arc(tipX, tipY, POINT_RADIUS * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isSelected) {
        ctx.shadowColor = 'rgba(16, 185, 129, 0.8)';
        ctx.shadowBlur = 15;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = isSelected ? '#10b981' : '#3f3f46';
      ctx.strokeStyle = isSelected ? '#ffffff' : '#a1a1aa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
    }

    if (playbackState !== 'stopped') {
      const pose = getInterpolatedPose(playbackTimeRef.current);
      if (pose && !isNaN(pose.x) && !isNaN(pose.y) && !isNaN(pose.theta)) {
        ctx.save();
        ctx.translate(pose.x * PIXELS_PER_METER, pose.y * PIXELS_PER_METER);
        ctx.rotate(pose.theta * Math.PI / 180);

        const size = 0.8 * PIXELS_PER_METER;
        ctx.fillStyle = 'rgba(14, 165, 233, 0.4)';
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeRect(-size / 2, -size / 2, size, size);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size / 2, 0);
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();

    const scaleWidthMeters = 1.0;
    const scaleWidthPixels = scaleWidthMeters * PIXELS_PER_METER * zoomLevel;
    ctx.fillStyle = '#a1a1aa';
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const scaleStartX = 20;
    const scaleStartY = canvas.height - 20;
    ctx.moveTo(scaleStartX, scaleStartY - 5);
    ctx.lineTo(scaleStartX, scaleStartY);
    ctx.lineTo(scaleStartX + scaleWidthPixels, scaleStartY);
    ctx.lineTo(scaleStartX + scaleWidthPixels, scaleStartY - 5);
    ctx.stroke();

    ctx.font = '12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1 meter', scaleStartX + scaleWidthPixels / 2, scaleStartY - 8);
  }, [
    currentPathName, currentPath, selectedIndex, viewOffset, zoomLevel,
    bgImgObj, bgWidth, bgHeight, bgOffsetX, bgOffsetY, isEditingBg, playbackState, getInterpolatedPose,
    canvasRef, playbackTimeRef
  ]);

  useEffect(() => {
    drawCanvasRef.current = drawCanvas;
  }, [drawCanvas, drawCanvasRef]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getMousePos = (evt: React.MouseEvent | React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const rawY = (evt.clientY - rect.top) * (canvas.height / rect.height);

    const x = (rawX - viewOffset.x) / (zoomLevel * PIXELS_PER_METER);
    const y = ((canvas.height - rawY) + viewOffset.y) / (zoomLevel * PIXELS_PER_METER);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!currentPathName) return;

    if (e.button === 1) {
      setIsPanning(true);
      return;
    }

    if (isEditingBg && bgImgObj) {
      const { x, y } = getMousePos(e);
      const handleRadius = 10 / (PIXELS_PER_METER * zoomLevel);
      const checkHandle = (hx: number, hy: number) => Math.hypot(x - hx, y - hy) <= handleRadius;

      if (checkHandle(bgOffsetX, bgOffsetY + bgHeight)) {
        setBgDragMode('tl'); setBgDragStart({ x, y, bgX: bgOffsetX, bgY: bgOffsetY, bgW: bgWidth, bgH: bgHeight }); return;
      }
      if (checkHandle(bgOffsetX + bgWidth, bgOffsetY + bgHeight)) {
        setBgDragMode('tr'); setBgDragStart({ x, y, bgX: bgOffsetX, bgY: bgOffsetY, bgW: bgWidth, bgH: bgHeight }); return;
      }
      if (checkHandle(bgOffsetX, bgOffsetY)) {
        setBgDragMode('bl'); setBgDragStart({ x, y, bgX: bgOffsetX, bgY: bgOffsetY, bgW: bgWidth, bgH: bgHeight }); return;
      }
      if (checkHandle(bgOffsetX + bgWidth, bgOffsetY)) {
        setBgDragMode('br'); setBgDragStart({ x, y, bgX: bgOffsetX, bgY: bgOffsetY, bgW: bgWidth, bgH: bgHeight }); return;
      }

      if (x >= bgOffsetX && x <= bgOffsetX + bgWidth && y >= bgOffsetY && y <= bgOffsetY + bgHeight) {
        setBgDragMode('move'); setBgDragStart({ x, y, bgX: bgOffsetX, bgY: bgOffsetY, bgW: bgWidth, bgH: bgHeight }); return;
      }
    }

    const { x, y } = getMousePos(e);

    const points = currentPath.points || [];
    let clickedIndex = -1;
    let clickedType: 'position' | 'heading' | null = null;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.theta != null) {
        const rad = p.theta * (Math.PI / 180);
        const tipX = p.x + (Math.cos(rad) * HEADING_LINE_LENGTH) / PIXELS_PER_METER;
        const tipY = p.y + (Math.sin(rad) * HEADING_LINE_LENGTH) / PIXELS_PER_METER;
        if (Math.hypot(tipX - x, tipY - y) < (POINT_RADIUS * 3) / PIXELS_PER_METER) {
          clickedIndex = i;
          clickedType = 'heading';
          break;
        }
      }
      if (Math.hypot(p.x - x, p.y - y) < (POINT_RADIUS * 3) / PIXELS_PER_METER) {
        clickedIndex = i;
        clickedType = 'position';
        break;
      }
    }

    if (clickedIndex !== -1) {
      if (e.shiftKey) {
        const newPoints = [...points];
        newPoints.splice(clickedIndex, 1);
        updateLocalPath({ ...currentPath, points: newPoints }, true, true, 'delete');
        if (selectedIndex === clickedIndex) setSelectedIndex(null);
        else if (selectedIndex != null && selectedIndex > clickedIndex) setSelectedIndex(selectedIndex - 1);
      } else {
        pushToHistory(true, clickedType);
        setSelectedIndex(clickedIndex);
        setDragMode(clickedType);
      }
    } else if (e.detail === 2) {
      const newPoints = [...points];

      let insertIndex = newPoints.length;
      let minDistanceSq = ((POINT_RADIUS * 3) / PIXELS_PER_METER) ** 2;

      for (let i = 0; i < newPoints.length - 1; i++) {
        const p1 = newPoints[i];
        const p2 = newPoints[i + 1];
        const dSq = distToSegmentSquared(x, y, p1.x, p1.y, p2.x, p2.y);
        if (dSq < minDistanceSq) {
          minDistanceSq = dSq;
          insertIndex = i + 1;
        }
      }

      newPoints.splice(insertIndex, 0, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), theta: 0 });
      updateLocalPath({ ...currentPath, points: newPoints }, true, true, 'add');
      setSelectedIndex(insertIndex);
    } else {
      setSelectedIndex(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = e.movementX * (canvas.width / rect.width);
      const dy = e.movementY * (canvas.height / rect.height);
      setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (bgDragMode && bgDragStart) {
      const { x, y } = getMousePos(e);
      const dx = x - bgDragStart.x;
      const dy = y - bgDragStart.y;

      if (bgDragMode === 'move') {
        setBgOffsetX(Number((bgDragStart.bgX + dx).toFixed(2)));
        setBgOffsetY(Number((bgDragStart.bgY + dy).toFixed(2)));
      } else if (bgDragMode === 'tr') {
        const newW = bgDragStart.bgW + dx;
        const newH = bgDragStart.bgH + dy;
        if (newW > 0) setBgWidth(Number(newW.toFixed(2)));
        if (newH > 0) setBgHeight(Number(newH.toFixed(2)));
      } else if (bgDragMode === 'tl') {
        const newW = bgDragStart.bgW - dx;
        const newH = bgDragStart.bgH + dy;
        if (newW > 0) {
          setBgWidth(Number(newW.toFixed(2)));
          setBgOffsetX(Number((bgDragStart.bgX + dx).toFixed(2)));
        }
        if (newH > 0) setBgHeight(Number(newH.toFixed(2)));
      } else if (bgDragMode === 'bl') {
        const newW = bgDragStart.bgW - dx;
        const newH = bgDragStart.bgH - dy;
        if (newW > 0) {
          setBgWidth(Number(newW.toFixed(2)));
          setBgOffsetX(Number((bgDragStart.bgX + dx).toFixed(2)));
        }
        if (newH > 0) {
          setBgHeight(Number(newH.toFixed(2)));
          setBgOffsetY(Number((bgDragStart.bgY + dy).toFixed(2)));
        }
      } else if (bgDragMode === 'br') {
        const newW = bgDragStart.bgW + dx;
        const newH = bgDragStart.bgH - dy;
        if (newW > 0) setBgWidth(Number(newW.toFixed(2)));
        if (newH > 0) {
          setBgHeight(Number(newH.toFixed(2)));
          setBgOffsetY(Number((bgDragStart.bgY + dy).toFixed(2)));
        }
      }
      return;
    }

    if (dragMode && selectedIndex !== null) {
      const { x, y } = getMousePos(e);
      const newPoints = [...(currentPath.points || [])];
      const p = { ...newPoints[selectedIndex] };

      if (dragMode === 'position') {
        p.x = Number(Math.max(0, Math.min(FIELD_WIDTH, x)).toFixed(2));
        p.y = Number(Math.max(0, Math.min(FIELD_HEIGHT, y)).toFixed(2));
      } else if (dragMode === 'heading') {
        let deg = Math.atan2(y - p.y, x - p.x) * (180 / Math.PI);
        deg = Math.round(deg);
        p.theta = deg;
      }

      newPoints[selectedIndex] = p;
      updateLocalPath({ ...currentPath, points: newPoints }, false, false, dragMode);
    }
  };

  const handleMouseUp = () => {
    if (bgDragMode) {
      if (projectDir) {
        localStorage.setItem(`bgWidth_${projectDir}`, bgWidth.toString());
        localStorage.setItem(`bgHeight_${projectDir}`, bgHeight.toString());
        localStorage.setItem(`bgOffsetX_${projectDir}`, bgOffsetX.toString());
        localStorage.setItem(`bgOffsetY_${projectDir}`, bgOffsetY.toString());
      }
      setBgDragMode(null);
      setBgDragStart(null);
      return;
    }
    setDragMode(null);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (selectedIndex !== null) {
      const p = currentPath.points?.[selectedIndex];
      if (p && p.theta != null) {
        const { x, y } = getMousePos(e);
        if (Math.hypot(p.x - x, p.y - y) < (POINT_RADIUS * 5) / PIXELS_PER_METER) {
          let delta = e.deltaY > 0 ? -5 : 5;
          let newTheta = p.theta + delta;
          if (newTheta > 180) newTheta -= 360;
          if (newTheta <= -180) newTheta += 360;
          updateSelectedPoint('theta', newTheta, false, 'heading_scroll');
          return;
        }
      }
    }

    const zoomSensitivity = 0.001;
    let newZoom = zoomLevel * Math.exp(-e.deltaY * zoomSensitivity);
    newZoom = Math.max(0.2, Math.min(newZoom, 5));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const rawY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const fieldPos = getMousePos(e);

    const newOffsetX = rawX - fieldPos.x * PIXELS_PER_METER * newZoom;
    const newOffsetY = rawY - canvas.height + fieldPos.y * PIXELS_PER_METER * newZoom;

    setZoomLevel(newZoom);
    setViewOffset({ x: newOffsetX, y: newOffsetY });
  };

  return (
    <div className="canvas-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {!projectDir ? (
        <div className="placeholder">
          <h2>Welcome to PointWeaver</h2>
          <p>Select your FRC project folder to begin.</p>
        </div>
      ) : !currentPathName ? (
        <div className="placeholder">
          <h2>Ready to Weave</h2>
          <p>Create or select a path from the sidebar.</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH * PIXELS_PER_METER}
          height={FIELD_HEIGHT * PIXELS_PER_METER}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: dragMode || bgDragMode ? 'grabbing' : 'crosshair' }}
        />
      )}
    </div>
  );
};
