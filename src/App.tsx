import { useRef, useState, useEffect } from 'react';
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
  params?: PathParams | null;
}

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

  // Load paths if dir is selected
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

  const rawPath = paths.find(p => p.name === currentPathName)?.content || { points: [] };
  const currentPath: PathDefinition = { points: rawPath.points || [], params: rawPath.params || null };

  useEffect(() => {
    drawCanvas();
  }, [currentPathName, paths, selectedIndex]);

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

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Dark Field Background
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);

    // Draw gorgeous neon grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD_WIDTH; x++) {
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, 0); ctx.lineTo(x * PIXELS_PER_METER, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= FIELD_HEIGHT; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * PIXELS_PER_METER); ctx.lineTo(canvas.width, y * PIXELS_PER_METER); ctx.stroke();
    }
    // Draw major grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= FIELD_WIDTH; x += 5) {
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, 0); ctx.lineTo(x * PIXELS_PER_METER, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= FIELD_HEIGHT; y += 5) {
      ctx.beginPath(); ctx.moveTo(0, y * PIXELS_PER_METER); ctx.lineTo(canvas.width, y * PIXELS_PER_METER); ctx.stroke();
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
    ctx.restore();
  };

  const getMousePos = (evt: React.MouseEvent | React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = ((evt.clientX - rect.left) * scaleX) / PIXELS_PER_METER;
    const y = (canvas.height - ((evt.clientY - rect.top) * scaleY)) / PIXELS_PER_METER;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!currentPathName) return;
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

  const handleMouseUp = () => setDragMode(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (selectedIndex === null) return;
    const p = currentPath.points?.[selectedIndex];
    if (!p || p.theta == null) return;

    const { x, y } = getMousePos(e);
    if (Math.hypot(p.x - x, p.y - y) < (POINT_RADIUS * 5) / PIXELS_PER_METER) {
      let delta = e.deltaY > 0 ? -5 : 5;
      let newTheta = p.theta + delta;
      if (newTheta > 180) newTheta -= 360;
      if (newTheta <= -180) newTheta += 360;
      updateSelectedPoint('theta', newTheta, false, 'heading_scroll');
    }
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

  const selectFolder = async () => {
    const path = await (window as any).electronAPI.selectDir();
    if (path) setProjectDir(path);
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

  return (
    <>
      <div className="sidebar">
        <div className="brand">
          <h1>PointWeaver</h1>
          <p>Local Path Editor</p>
        </div>

        <button className="primary-btn" onClick={selectFolder}>
          {projectDir ? 'Change Project Folder' : 'Open FRC Project'}
        </button>

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
                <button className="primary-btn" style={{ width: '100%' }} onClick={addWaypoint}>
                  + Add Waypoint
                </button>
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

            <button className="danger-btn" onClick={deleteSelectedWaypoint}>
              Delete Waypoint
            </button>
          </div>
        )}
      </div>

      <div className="canvas-container">
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
            style={{ cursor: dragMode ? 'grabbing' : 'crosshair' }}
          />
        )}
      </div>
    </>
  );
}
