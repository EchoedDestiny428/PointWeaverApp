import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';

interface PathParams {
  minSpeed?: number | null;
  maxSpeed?: number | null;
  earlyExitRange?: number | null;
  timeout?: number | null;
  interpolate?: boolean | null;
}

interface PathPoint {
  x: number;
  y: number;
  theta?: number | null;
  event?: string | null;
  params?: PathParams | null;
}

interface PathDefinition {
  points: PathPoint[];
  params: PathParams | null;
}

interface SimulatedPose {
  t: number;
  x: number;
  y: number;
  theta: number;
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);

const findNextHeadingIndex = (points: PathPoint[], startIndex: number) => {
  let j = startIndex + 1;
  while (j < points.length) {
    if (points[j].theta != null) return j;
    j++;
  }
  return -1;
};

const computeGroupTotals = (points: PathPoint[]) => {
  const n = points.length;
  const groupTotals = new Array(n).fill(NaN);
  if (n < 2) return groupTotals;

  const prefix = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    prefix[i] = prefix[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  let i = 0;
  while (i < n) {
    if (points[i].theta == null) { i++; continue; }
    let j = i + 1;
    while (j < n && points[j].theta == null) j++;
    if (j < n && points[j].theta != null) {
      const total = prefix[j] - prefix[i];
      if (total > 1e-9) {
        for (let k = i; k <= j; k++) groupTotals[k] = total;
      }
      i = j;
    } else {
      break;
    }
  }
  return groupTotals;
};

const FIELD_WIDTH = 16.54;
const FIELD_HEIGHT = 8.21;
const PIXELS_PER_METER = 50;
const POINT_RADIUS = 12; // Increased size
const HEADING_LINE_LENGTH = 40; // Increased length

const distToSegmentSquared = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (l2 === 0) return (x - x1) ** 2 + (y - y1) ** 2;
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (x - (x1 + t * (x2 - x1))) ** 2 + (y - (y1 + t * (y2 - y1))) ** 2;
};

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [paths, setPaths] = useState<{ name: string, content: PathDefinition }[]>([]);
  const [currentPathName, setCurrentPathName] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCreatingPath, setIsCreatingPath] = useState(false);
  const [newPathName, setNewPathName] = useState('');

  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [historyPast, setHistoryPast] = useState<{ name: string, content: PathDefinition }[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<{ name: string, content: PathDefinition }[][]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragMode, setDragMode] = useState<'position' | 'heading' | null>(null);

  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgImgObj, setBgImgObj] = useState<HTMLImageElement | null>(null);

  const [bgWidth, setBgWidth] = useState(FIELD_WIDTH);
  const [bgHeight, setBgHeight] = useState(FIELD_HEIGHT);
  const [bgOffsetX, setBgOffsetX] = useState(0);
  const [bgOffsetY, setBgOffsetY] = useState(0);

  const [isEditingBg, setIsEditingBg] = useState(false);
  const [bgDragMode, setBgDragMode] = useState<'move' | 'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const [bgDragStart, setBgDragStart] = useState<{ x: number, y: number, bgX: number, bgY: number, bgW: number, bgH: number } | null>(null);

  // Load paths if dir is selected
  useEffect(() => {
    if (projectDir) {
      loadPaths();
      const savedBg = localStorage.getItem(`bg_${projectDir}`);
      if (savedBg) setBgImage(savedBg);

      const savedBgWidth = localStorage.getItem(`bgWidth_${projectDir}`);
      if (savedBgWidth) setBgWidth(parseFloat(savedBgWidth));
      else setBgWidth(FIELD_WIDTH);

      const savedBgHeight = localStorage.getItem(`bgHeight_${projectDir}`);
      if (savedBgHeight) setBgHeight(parseFloat(savedBgHeight));
      else setBgHeight(FIELD_HEIGHT);

      const savedBgOffsetX = localStorage.getItem(`bgOffsetX_${projectDir}`);
      if (savedBgOffsetX) setBgOffsetX(parseFloat(savedBgOffsetX));
      else setBgOffsetX(0);

      const savedBgOffsetY = localStorage.getItem(`bgOffsetY_${projectDir}`);
      if (savedBgOffsetY) setBgOffsetY(parseFloat(savedBgOffsetY));
      else setBgOffsetY(0);
    }
  }, [projectDir]);

  useEffect(() => {
    if (bgImage) {
      const img = new Image();
      img.src = bgImage;
      img.onload = () => setBgImgObj(img);
    } else {
      setBgImgObj(null);
    }
  }, [bgImage]);

  const loadPaths = async () => {
    const res = await (window as any).electronAPI.readPaths(projectDir + '\\src\\main\\deploy\\autonomous');
    if (res.paths) {
      setPaths(res.paths);
      if (!currentPathName && res.paths.length > 0) {
        setCurrentPathName(res.paths[0].name);
      }
    }
  };

  const rawPath = paths.find(p => p.name === currentPathName)?.content || { points: [] };
  const currentPath: PathDefinition = { points: rawPath.points || [], params: rawPath.params || null };

  useEffect(() => {
    drawCanvas();
  }, [currentPathName, paths, selectedIndex, viewOffset, zoomLevel, bgImgObj, bgWidth, bgHeight, bgOffsetX, bgOffsetY, isEditingBg]);

  const playbackStateRef = useRef<'stopped' | 'playing' | 'paused'>('stopped');
  const playbackTimeRef = useRef<number>(0);
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const computedTrajectory = useMemo(() => {
    const points = currentPath.points || [];
    const trajectory: SimulatedPose[] = [];
    if (points.length === 0) return trajectory;

    let currX = points[0].x;
    let currY = points[0].y;
    let currTheta = points[0].theta ?? 0;

    let t = 0;
    trajectory.push({ t, x: currX, y: currY, theta: currTheta });

    if (points.length === 1) return trajectory;

    const groupTotals = computeGroupTotals(points);
    const dt = 0.02; // 50Hz simulation
    const PathMoveKp = 1.0;
    const PathPosTolerance = 0.05;
    const defaultMaxSpeed = 3.0; // Assume 3m/s default top speed

    let lastTheta = points[0].theta ?? 0;

    for (let i = 1; i < points.length; i++) {
      const targetPoint = points[i];
      let maxSpeed = targetPoint.params?.maxSpeed ?? currentPath.params?.maxSpeed ?? defaultMaxSpeed;
      if (isNaN(maxSpeed)) maxSpeed = defaultMaxSpeed;
      let minSpeed = targetPoint.params?.minSpeed ?? currentPath.params?.minSpeed ?? 0.0;
      if (isNaN(minSpeed)) minSpeed = 0.0;
      let earlyExit = targetPoint.params?.earlyExitRange ?? currentPath.params?.earlyExitRange ?? PathPosTolerance;
      if (isNaN(earlyExit)) earlyExit = PathPosTolerance;
      const interpolate = targetPoint.params?.interpolate ?? currentPath.params?.interpolate ?? false;

      let prevIdx = i - 1;
      let nextHeadingIdx = findNextHeadingIndex(points, prevIdx);
      let groupTotal = groupTotals[prevIdx];

      while (true) {
        let dist = Math.hypot(targetPoint.x - currX, targetPoint.y - currY);
        if (dist <= earlyExit) {
          if (targetPoint.theta != null) {
            lastTheta = targetPoint.theta;
            currTheta = lastTheta;
          }
          break;
        }

        let speed = dist * PathMoveKp;
        let clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
        if (clampedSpeed < 1e-3) clampedSpeed = 1e-3; // prevent infinite loops

        let dx = (targetPoint.x - currX) / dist;
        let dy = (targetPoint.y - currY) / dist;

        currX += dx * clampedSpeed * dt;
        currY += dy * clampedSpeed * dt;

        if (nextHeadingIdx !== -1 && !isNaN(groupTotal) && interpolate) {
          let targetForDist = points[nextHeadingIdx];
          let remainingDist = Math.hypot(targetForDist.x - currX, targetForDist.y - currY);
          let rawProgress = Math.max(0, Math.min(1.0, 1.0 - (remainingDist / groupTotal)));
          let progress = smoothstep(rawProgress);

          let t1 = lastTheta;
          let t2 = targetForDist.theta!;
          let dTheta = t2 - t1;
          if (dTheta > 180) dTheta -= 360;
          if (dTheta < -180) dTheta += 360;
          currTheta = t1 + dTheta * progress;
        } else if (targetPoint.theta != null) {
          currTheta = targetPoint.theta;
        }

        t += dt;
        trajectory.push({ t, x: currX, y: currY, theta: currTheta });
      }
    }

    return trajectory;
  }, [currentPath]);

  const getTotalPathTime = () => {
    if (computedTrajectory.length === 0) return 0;
    return computedTrajectory[computedTrajectory.length - 1].t;
  };

  const getInterpolatedPose = (t: number) => {
    if (computedTrajectory.length === 0) return null;
    if (t <= computedTrajectory[0].t) return computedTrajectory[0];
    if (t >= computedTrajectory[computedTrajectory.length - 1].t) return computedTrajectory[computedTrajectory.length - 1];

    let low = 0;
    let high = computedTrajectory.length - 1;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      if (computedTrajectory[mid].t === t) return computedTrajectory[mid];
      if (computedTrajectory[mid].t < t) low = mid + 1;
      else high = mid - 1;
    }

    const p1 = computedTrajectory[high];
    const p2 = computedTrajectory[low];
    const dt = p2.t - p1.t;
    const progress = dt === 0 ? 0 : (t - p1.t) / dt;

    let dTheta = p2.theta - p1.theta;
    if (dTheta > 180) dTheta -= 360;
    if (dTheta < -180) dTheta += 360;

    return {
      x: p1.x + (p2.x - p1.x) * progress,
      y: p1.y + (p2.y - p1.y) * progress,
      theta: p1.theta + dTheta * progress
    };
  };

  const stopPlayback = () => {
    setPlaybackState('stopped');
    playbackStateRef.current = 'stopped';
    playbackTimeRef.current = 0;
    drawCanvas();
  };

  const drawCanvasRef = useRef<() => void>(() => { });
  const getTotalPathTimeRef = useRef<() => number>(() => 0);

  useEffect(() => {
    drawCanvasRef.current = drawCanvas;
    getTotalPathTimeRef.current = getTotalPathTime;
  }, [drawCanvas, getTotalPathTime]);

  const animationLoop = (time: number) => {
    if (playbackStateRef.current === 'stopped') {
      animationRef.current = null;
      return;
    }
    if (playbackStateRef.current === 'playing') {
      const dt = (time - lastTickRef.current) / 1000;
      playbackTimeRef.current += dt;
      if (playbackTimeRef.current > getTotalPathTimeRef.current()) {
        playbackTimeRef.current = 0; // Loop instead of stop
      }
    }
    lastTickRef.current = time;
    drawCanvasRef.current();
    animationRef.current = requestAnimationFrame(animationLoop);
  };

  const playPause = () => {
    if (playbackState === 'playing') {
      setPlaybackState('paused');
      playbackStateRef.current = 'paused';
    } else {
      if (playbackState === 'stopped') playbackTimeRef.current = 0;
      setPlaybackState('playing');
      playbackStateRef.current = 'playing';
      lastTickRef.current = performance.now();
      if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(animationLoop);
      }
    }
  };

  const lastPushTimeRef = useRef<number>(0);
  const lastActionTypeRef = useRef<string | null>(null);

  const pushToHistory = (force = true, actionType: string | null = null) => {
    const now = Date.now();

    if (actionType && actionType !== lastActionTypeRef.current) {
      force = true;
    }

    if (!force && now - lastPushTimeRef.current < 500) {
      lastPushTimeRef.current = now;
      lastActionTypeRef.current = actionType;
      return;
    }

    lastPushTimeRef.current = now;
    lastActionTypeRef.current = actionType;

    if (historyPast.length > 0 && JSON.stringify(historyPast[historyPast.length - 1]) === JSON.stringify(paths)) {
      return;
    }
    setHistoryPast([...historyPast, paths]);
    setHistoryFuture([]);
  };

  const undo = () => {
    if (historyPast.length === 0) return;
    const newPast = [...historyPast];
    const lastState = newPast.pop()!;

    setHistoryPast(newPast);
    setHistoryFuture([paths, ...historyFuture]);
    setPaths(lastState);
    setDirtyPaths(dp => {
      const ndp = new Set(dp);
      if (currentPathName) ndp.add(currentPathName);
      return ndp;
    });
  };

  const redo = () => {
    if (historyFuture.length === 0) return;
    const newFuture = [...historyFuture];
    const nextState = newFuture.shift()!;

    setHistoryFuture(newFuture);
    setHistoryPast([...historyPast, paths]);
    setPaths(nextState);
    setDirtyPaths(dp => {
      const ndp = new Set(dp);
      if (currentPathName) ndp.add(currentPathName);
      return ndp;
    });
  };

  const updateLocalPath = (newDef: PathDefinition, pushHistory = true, forceHistory = true, actionType: string | null = null) => {
    if (!currentPathName) return;
    if (pushHistory) pushToHistory(forceHistory, actionType);

    const newPaths = paths.map(p => p.name === currentPathName ? { ...p, content: newDef } : p);
    setPaths(newPaths);
    setDirtyPaths(prev => {
      const nd = new Set(prev);
      nd.add(currentPathName);
      return nd;
    });
  };

  const [renamingPathName, setRenamingPathName] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');

  const saveCurrentPath = async () => {
    if (!projectDir || !currentPathName) return;
    const rawDef = paths.find(p => p.name === currentPathName)?.content;
    if (!rawDef) return;

    const cleanDef = JSON.parse(JSON.stringify(rawDef));
    if (cleanDef.points) {
      cleanDef.points.forEach((p: any) => {
        if (p.params && Object.keys(p.params).length === 0) delete p.params;
      });
    }

    await (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', currentPathName, cleanDef);

    setDirtyPaths(prev => {
      const nd = new Set(prev);
      nd.delete(currentPathName);
      return nd;
    });
  };

  const startRename = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPathName(name);
    setRenameInputValue(name);
  };

  const confirmRename = async (oldName: string) => {
    const newName = renameInputValue.trim();
    if (!newName || newName === oldName) {
      setRenamingPathName(null);
      return;
    }
    if (paths.some(p => p.name === newName)) {
      alert("A path with that name already exists!");
      return;
    }
    if (projectDir) {
      const res = await (window as any).electronAPI.renamePath(projectDir + '\\src\\main\\deploy\\autonomous', oldName, newName);
      if (res.error) {
        alert("Failed to rename: " + res.error);
        return;
      }
    }

    setPaths(paths.map(p => p.name === oldName ? { ...p, name: newName } : p));
    if (currentPathName === oldName) setCurrentPathName(newName);

    setDirtyPaths(prev => {
      const nd = new Set(prev);
      if (nd.has(oldName)) {
        nd.delete(oldName);
        nd.add(newName);
      }
      return nd;
    });
    setRenamingPathName(null);
  };

  const deletePath = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete '${name}.json'? This cannot be undone.`)) return;

    if (projectDir) {
      const res = await (window as any).electronAPI.deletePath(projectDir + '\\src\\main\\deploy\\autonomous', name);
      if (res.error) {
        alert("Failed to delete: " + res.error);
        return;
      }
    }

    setPaths(paths.filter(p => p.name !== name));
    if (currentPathName === name) {
      setCurrentPathName(paths.find(p => p.name !== name)?.name || null);
      setSelectedIndex(null);
    }
    setDirtyPaths(prev => {
      const nd = new Set(prev);
      nd.delete(name);
      return nd;
    });
  };

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Dark Field Background
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

        ctx.strokeStyle = '#f59e0b'; // amber-500
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

    // Draw gorgeous neon grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x++) {
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, startY * PIXELS_PER_METER); ctx.lineTo(x * PIXELS_PER_METER, endY * PIXELS_PER_METER); ctx.stroke();
    }
    for (let y = startY; y <= endY; y++) {
      ctx.beginPath(); ctx.moveTo(startX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.lineTo(endX * PIXELS_PER_METER, y * PIXELS_PER_METER); ctx.stroke();
    }
    // Draw major grid lines
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

    // Draw connecting lines with drop shadow
    if (points.length > 1) {
      ctx.shadowColor = 'rgba(14, 165, 233, 0.5)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#0ea5e9'; // sky-500
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const px = points[i].x * PIXELS_PER_METER;
        const py = points[i].y * PIXELS_PER_METER;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow
    }

    // Draw Waypoints
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const px = p.x * PIXELS_PER_METER;
      const py = p.y * PIXELS_PER_METER;

      const isSelected = i === selectedIndex;

      // Draw early exit range
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

      // Draw heading indicator first so it sits under the point
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

        // Draw small handle at the tip
        ctx.fillStyle = isSelected ? '#10b981' : '#a1a1aa';
        ctx.beginPath();
        ctx.arc(tipX, tipY, POINT_RADIUS * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Point glow
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

    if (playbackStateRef.current !== 'stopped') {
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

    ctx.restore(); // restore from the view offset transform

    // Draw scale UI over everything
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
  };

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

    if (e.button === 1) { // Middle click to pan
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
      // Check heading line tip first
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
      // Check point body
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
      // CLONE the point to avoid mutating the history state!
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

  const updateSelectedPoint = (field: keyof PathPoint, value: any, forceHistory = true, actionType: string | null = null) => {
    if (selectedIndex === null) return;
    const newPoints = [...(currentPath.points || [])];
    newPoints[selectedIndex] = { ...newPoints[selectedIndex], [field]: value };
    updateLocalPath({ ...currentPath, points: newPoints }, true, forceHistory, actionType || `prop_${field}`);
  };

  const updateSelectedPointParams = (field: keyof PathParams, value: any, forceHistory = true, actionType: string | null = null) => {
    if (selectedIndex === null) return;
    const newPoints = [...(currentPath.points || [])];
    const p = { ...newPoints[selectedIndex] };
    const newParams = { ...(p.params || {}), [field]: value };
    p.params = newParams;
    newPoints[selectedIndex] = p;
    updateLocalPath({ ...currentPath, points: newPoints }, true, forceHistory, actionType || `param_${field}`);
  };

  const updatePathParams = (field: keyof PathParams, value: any, forceHistory = true, actionType: string | null = null) => {
    const newParams = { ...(currentPath.params || {}), [field]: value };
    updateLocalPath({ ...currentPath, params: newParams }, true, forceHistory, actionType || `path_param_${field}`);
  };

  const selectFolder = async () => {
    const path = await (window as any).electronAPI.selectDir();
    if (path) setProjectDir(path);
  };

  const updateBgConfig = (key: string, value: number) => {
    if (!projectDir) return;
    localStorage.setItem(`${key}_${projectDir}`, value.toString());
    if (key === 'bgWidth') setBgWidth(value);
    if (key === 'bgHeight') setBgHeight(value);
    if (key === 'bgOffsetX') setBgOffsetX(value);
    if (key === 'bgOffsetY') setBgOffsetY(value);
  };

  const selectBgImage = async () => {
    if ((window as any).electronAPI) {
      const base64 = await (window as any).electronAPI.selectImage();
      if (base64) {
        setBgImage(base64);
        if (projectDir) localStorage.setItem(`bg_${projectDir}`, base64);
      }
    } else {
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            const base64 = re.target?.result as string;
            setBgImage(base64);
            if (projectDir) localStorage.setItem(`bg_${projectDir}`, base64);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const flipX = () => {
    if (!currentPathName || !currentPath.points) return;
    const newPoints = currentPath.points.map(p => ({
      ...p,
      x: Number((FIELD_WIDTH - p.x).toFixed(2)),
      theta: p.theta != null ? ((180 - p.theta + 180) % 360 - 180) : null
    }));
    updateLocalPath({ ...currentPath, points: newPoints }, true, true, 'flipX');
  };

  const flipY = () => {
    if (!currentPathName || !currentPath.points) return;
    const newPoints = currentPath.points.map(p => ({
      ...p,
      y: Number((FIELD_HEIGHT - p.y).toFixed(2)),
      theta: p.theta != null ? (p.theta === 0 ? 0 : -p.theta) : null
    }));
    updateLocalPath({ ...currentPath, points: newPoints }, true, true, 'flipY');
  };

  const confirmCreatePath = (rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      setIsCreatingPath(false);
      return;
    }
    if (paths.some(p => p.name === name)) {
      alert("Path already exists!");
      return;
    }
    const def = { points: [] };
    setPaths([...paths, { name, content: def }]);
    setCurrentPathName(name);
    setIsCreatingPath(false);
    if (projectDir) {
      (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', name, def);
    }
  };

  const addWaypoint = () => {
    if (!currentPathName) return;
    const newPoints = [...(currentPath.points || [])];
    const lastPoint = newPoints[newPoints.length - 1] || { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
    newPoints.push({ x: Number((lastPoint.x + 0.5).toFixed(2)), y: Number((lastPoint.y + 0.5).toFixed(2)), theta: 0 });
    updateLocalPath({ ...currentPath, points: newPoints });
    setSelectedIndex(newPoints.length - 1);
  };

  const deleteSelectedWaypoint = () => {
    if (selectedIndex === null || !currentPathName) return;
    const newPoints = [...(currentPath.points || [])];
    newPoints.splice(selectedIndex, 1);
    updateLocalPath({ ...currentPath, points: newPoints });
    setSelectedIndex(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo();
        else undo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        saveCurrentPath();
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedWaypoint();
      } else if (e.key === 'Escape') {
        setSelectedIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const selectedPoint = selectedIndex !== null && currentPath.points && currentPath.points[selectedIndex] ? currentPath.points[selectedIndex] : null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (re) => {
        const base64 = re.target?.result as string;
        setBgImage(base64);
        if (projectDir) localStorage.setItem(`bg_${projectDir}`, base64);
        setIsEditingBg(true);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <div className="sidebar">
        <div className="brand">
          <h1>PointWeaver</h1>
          <p>Local Path Editor</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className="primary-btn" style={{ flex: 1, padding: '0.5rem' }} onClick={selectFolder}>
            {projectDir ? 'Change Project' : 'Open FRC Project'}
          </button>
          {projectDir && (
            <button className="secondary-btn" style={{ flex: 1, padding: '0.5rem' }} onClick={selectBgImage}>
              Set Field Image
            </button>
          )}
        </div>

        {projectDir && bgImgObj && (
          <div className="properties-panel glass-panel" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsEditingBg(!isEditingBg)}>
              <h4 style={{ margin: 0, fontSize: '0.8rem', color: '#a1a1aa' }}>Field Image Settings</h4>
              <button
                className="secondary-btn"
                style={{ 
                  padding: '0.3rem 0.75rem', 
                  fontSize: '0.75rem',
                  background: isEditingBg ? 'rgba(245, 158, 11, 0.15)' : undefined,
                  borderColor: isEditingBg ? 'rgba(245, 158, 11, 0.5)' : undefined,
                  color: isEditingBg ? '#f59e0b' : undefined
                }}
                onClick={(e) => { e.stopPropagation(); setIsEditingBg(!isEditingBg); }}
              >
                {isEditingBg ? 'Done' : 'Edit'}
              </button>
            </div>

            {isEditingBg && (
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ fontSize: '0.7rem', color: '#a1a1aa', margin: '0 0 0.5rem 0' }}>Drag corners on canvas to resize. Drag & drop an image onto the canvas to replace.</p>
                <div className="input-row" style={{ gap: '0.25rem' }}>
                  <div className="input-group">
                    <label style={{ fontSize: '0.7rem' }}>W (m)</label>
                    <input type="number" step="0.1" value={bgWidth} onChange={(e) => updateBgConfig('bgWidth', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label style={{ fontSize: '0.7rem' }}>H (m)</label>
                    <input type="number" step="0.1" value={bgHeight} onChange={(e) => updateBgConfig('bgHeight', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label style={{ fontSize: '0.7rem' }}>X (m)</label>
                    <input type="number" step="0.1" value={bgOffsetX} onChange={(e) => updateBgConfig('bgOffsetX', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="input-group">
                    <label style={{ fontSize: '0.7rem' }}>Y (m)</label>
                    <input type="number" step="0.1" value={bgOffsetY} onChange={(e) => updateBgConfig('bgOffsetY', parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {projectDir && (
          <div className="path-list">
            <div className="list-header">
              <h3>Auton Paths</h3>
              <button className="icon-btn" onClick={() => { setIsCreatingPath(true); setNewPathName(''); }}>+</button>
            </div>
            {isCreatingPath && (
              <div style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Path Name"
                  value={newPathName}
                  onChange={e => setNewPathName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      confirmCreatePath(newPathName);
                    } else if (e.key === 'Escape') {
                      setIsCreatingPath(false);
                    }
                  }}
                  onBlur={() => {
                    if (newPathName.trim()) {
                      confirmCreatePath(newPathName);
                    } else {
                      setIsCreatingPath(false);
                    }
                  }}
                  style={{ width: '100%', padding: '0.25rem', boxSizing: 'border-box' }}
                />
              </div>
            )}
            <ul>
              {paths.map(p => {
                const isD = dirtyPaths.has(p.name);
                if (renamingPathName === p.name) {
                  return (
                    <li key={p.name} className="active" style={{ padding: '0.25rem 0.5rem' }}>
                      <input
                        className="rename-input"
                        autoFocus
                        type="text"
                        value={renameInputValue}
                        onChange={e => {
                          e.stopPropagation();
                          setRenameInputValue(e.target.value);
                        }}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') confirmRename(p.name);
                          else if (e.key === 'Escape') setRenamingPathName(null);
                        }}
                      />
                    </li>
                  );
                }

                return (
                  <li key={p.name} className={p.name === currentPathName ? 'active' : ''} onClick={() => { setCurrentPathName(p.name); setSelectedIndex(null); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.name}.json {isD && '*'}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="icon-btn-small" onClick={(e) => startRename(p.name, e)}>✎</button>
                      <button className="icon-btn-small" onClick={(e) => deletePath(p.name, e)}>✖</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {currentPathName && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="primary-btn" style={{ flex: 1, background: playbackState === 'playing' ? '#f59e0b' : '#10b981' }} onClick={playPause}>
                    {playbackState === 'playing' ? 'Pause Ghost' : 'Play Ghost'}
                  </button>
                  <button className="secondary-btn" onClick={stopPlayback} disabled={playbackState === 'stopped'}>
                    Stop
                  </button>
                </div>
                <button className="primary-btn" style={{ width: '100%' }} onClick={addWaypoint}>
                  + Add Waypoint
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="secondary-btn" style={{ flex: 1 }} onClick={flipX}>Flip X</button>
                  <button className="secondary-btn" style={{ flex: 1 }} onClick={flipY}>Flip Y</button>
                </div>
                <button
                  className="primary-btn"
                  style={{ width: '100%', background: dirtyPaths.has(currentPathName) ? '#eab308' : '#3f3f46', color: dirtyPaths.has(currentPathName) ? '#000' : '#fff', opacity: dirtyPaths.has(currentPathName) ? 1 : 0.5 }}
                  onClick={saveCurrentPath}
                  disabled={!dirtyPaths.has(currentPathName)}
                >
                  Save Path (Ctrl+S)
                </button>
              </div>
            )}
          </div>
        )}

        {!selectedPoint && currentPathName && (
          <div className="properties-panel glass-panel">
            <h3>Default Params</h3>

            <div className="input-row">
              <div className="input-group">
                <label>Max Speed</label>
                <input type="number" step="0.5" value={currentPath.params?.maxSpeed ?? ''} placeholder="3.0" onChange={(e) => updatePathParams('maxSpeed', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="input-group">
                <label>Min Speed</label>
                <input type="number" step="0.5" value={currentPath.params?.minSpeed ?? ''} placeholder="0.0" onChange={(e) => updatePathParams('minSpeed', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            </div>

            <div className="input-group">
              <label>Early Exit Range (m)</label>
              <input type="number" step="0.1" value={currentPath.params?.earlyExitRange ?? ''} placeholder="0.05" onChange={(e) => updatePathParams('earlyExitRange', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>

            <div className="input-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="checkbox" id="default-interpolate-checkbox" checked={currentPath.params?.interpolate ?? false} onChange={(e) => updatePathParams('interpolate', e.target.checked)} style={{ width: 'auto' }} />
              <label htmlFor="default-interpolate-checkbox" style={{ margin: 0, cursor: 'pointer' }}>Interpolate Heading</label>
            </div>
          </div>
        )}

        {selectedPoint && (
          <div className="properties-panel glass-panel">
            <h3>Waypoint {selectedIndex}</h3>

            <div className="input-row">
              <div className="input-group">
                <label>X (m)</label>
                <input type="number" step="0.1" value={selectedPoint.x} onChange={(e) => updateSelectedPoint('x', parseFloat(e.target.value))} />
              </div>
              <div className="input-group">
                <label>Y (m)</label>
                <input type="number" step="0.1" value={selectedPoint.y} onChange={(e) => updateSelectedPoint('y', parseFloat(e.target.value))} />
              </div>
            </div>

            <div className="input-group">
              <label>Heading (deg)</label>
              <div className="checkbox-input">
                <input type="checkbox" checked={selectedPoint.theta != null} onChange={(e) => updateSelectedPoint('theta', e.target.checked ? 0 : null)} />
                <input type="number" step="1" disabled={selectedPoint.theta == null} value={selectedPoint.theta ?? ''} onChange={(e) => updateSelectedPoint('theta', parseFloat(e.target.value))} style={{ flex: 1 }} />
              </div>
            </div>

            <div className="input-group">
              <label>Event Marker</label>
              <input type="text" value={selectedPoint.event || ''} placeholder="e.g. shoot" onChange={(e) => updateSelectedPoint('event', e.target.value || null)} />
            </div>

            <div className="divider"></div>
            <h4>Overrides</h4>

            <div className="input-row">
              <div className="input-group">
                <label>Max Speed</label>
                <input type="number" step="0.5" value={selectedPoint.params?.maxSpeed ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('maxSpeed', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="input-group">
                <label>Min Speed</label>
                <input type="number" step="0.5" value={selectedPoint.params?.minSpeed ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('minSpeed', e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
            </div>

            <div className="input-group">
              <label>Early Exit Range (m)</label>
              <input type="number" step="0.1" value={selectedPoint.params?.earlyExitRange ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('earlyExitRange', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>

            <div className="input-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="checkbox" id="interpolate-checkbox" checked={selectedPoint.params?.interpolate ?? false} onChange={(e) => updateSelectedPointParams('interpolate', e.target.checked)} style={{ width: 'auto' }} />
              <label htmlFor="interpolate-checkbox" style={{ margin: 0, cursor: 'pointer' }}>Interpolate Heading</label>
            </div>

            <button className="danger-btn" onClick={deleteSelectedWaypoint}>
              Delete Waypoint
            </button>
          </div>
        )}
      </div>

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
    </>
  );
}
