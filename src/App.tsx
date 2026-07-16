import React, { useState, useEffect } from 'react';
import './App.css';

import type { PathParams, PathPoint } from './types';
import { FIELD_WIDTH, FIELD_HEIGHT } from './constants';
import { Sidebar } from './features/sidebar/Sidebar';
import { FieldCanvas } from './features/canvas/FieldCanvas';
import { usePathEditor } from './hooks/usePathEditor';
import { usePlayback } from './hooks/usePlayback';
import { useFieldImage } from './hooks/useFieldImage';

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const {
    paths, setPaths,
    currentPathName, setCurrentPathName,
    selectedIndex, setSelectedIndex,
    dirtyPaths, setDirtyPaths,
    currentPath,
    updateLocalPath, pushToHistory,
    undo, redo, saveCurrentPath
  } = usePathEditor(projectDir);

  const {
    playbackState,
    playbackTimeRef,
    getInterpolatedPose,
    playPause, stopPlayback,
    drawCanvasRef
  } = usePlayback(currentPath);

  const {
    bgImgObj,
    bgWidth, setBgWidth,
    bgHeight, setBgHeight,
    bgOffsetX, setBgOffsetX,
    bgOffsetY, setBgOffsetY,
    isEditingBg, setIsEditingBg,
    updateBgConfig, selectBgImage,
    handleDrop, handleDragOver
  } = useFieldImage(projectDir);

  const [dragMode, setDragMode] = useState<'position' | 'heading' | null>(null);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [bgDragMode, setBgDragMode] = useState<'move' | 'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const [bgDragStart, setBgDragStart] = useState<{ x: number, y: number, bgX: number, bgY: number, bgW: number, bgH: number } | null>(null);

  useEffect(() => {
    if (projectDir) {
      loadPaths();
    }
  }, [projectDir]);

  const loadPaths = async () => {
    const res = await (window as any).electronAPI.readPaths(projectDir + '\\src\\main\\deploy\\autonomous');
    if (res.paths) {
      setPaths(res.paths);
      if (!currentPathName && res.paths.length > 0) {
        setCurrentPathName(res.paths[0].name);
      }
    }
  };

  const selectFolder = async () => {
    const path = await (window as any).electronAPI.selectDir();
    if (path) setProjectDir(path);
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

  return (
    <>
      <Sidebar
        projectDir={projectDir}
        selectFolder={selectFolder}
        selectBgImage={selectBgImage}
        bgImgObj={bgImgObj}
        bgWidth={bgWidth}
        bgHeight={bgHeight}
        bgOffsetX={bgOffsetX}
        bgOffsetY={bgOffsetY}
        isEditingBg={isEditingBg}
        setIsEditingBg={setIsEditingBg}
        updateBgConfig={updateBgConfig}
        paths={paths}
        currentPathName={currentPathName}
        setCurrentPathName={setCurrentPathName}
        setSelectedIndex={setSelectedIndex}
        dirtyPaths={dirtyPaths}
        playbackState={playbackState}
        playPause={playPause}
        stopPlayback={stopPlayback}
        addWaypoint={addWaypoint}
        flipX={flipX}
        flipY={flipY}
        saveCurrentPath={saveCurrentPath}
        setPaths={setPaths}
        setDirtyPaths={setDirtyPaths}
        currentPath={currentPath}
        selectedIndex={selectedIndex}
        selectedPoint={selectedPoint}
        updatePathParams={updatePathParams}
        updateSelectedPoint={updateSelectedPoint}
        updateSelectedPointParams={updateSelectedPointParams}
        deleteSelectedWaypoint={deleteSelectedWaypoint}
      />
      <FieldCanvas
        projectDir={projectDir}
        currentPathName={currentPathName}
        currentPath={currentPath}
        selectedIndex={selectedIndex}
        bgImgObj={bgImgObj}
        bgWidth={bgWidth}
        bgHeight={bgHeight}
        bgOffsetX={bgOffsetX}
        bgOffsetY={bgOffsetY}
        isEditingBg={isEditingBg}
        viewOffset={viewOffset}
        zoomLevel={zoomLevel}
        isPanning={isPanning}
        dragMode={dragMode}
        bgDragMode={bgDragMode}
        bgDragStart={bgDragStart}
        playbackState={playbackState}
        playbackTimeRef={playbackTimeRef}
        canvasRef={canvasRef}
        setZoomLevel={setZoomLevel}
        setViewOffset={setViewOffset}
        setIsPanning={setIsPanning}
        setDragMode={setDragMode}
        setBgDragMode={setBgDragMode}
        setBgDragStart={setBgDragStart}
        setSelectedIndex={setSelectedIndex}
        updateLocalPath={updateLocalPath}
        pushToHistory={pushToHistory}
        setBgOffsetX={setBgOffsetX}
        setBgOffsetY={setBgOffsetY}
        setBgWidth={setBgWidth}
        setBgHeight={setBgHeight}
        updateSelectedPoint={updateSelectedPoint}
        getInterpolatedPose={getInterpolatedPose}
        handleDrop={handleDrop}
        handleDragOver={handleDragOver}
        drawCanvasRef={drawCanvasRef}
      />
    </>
  );
}
