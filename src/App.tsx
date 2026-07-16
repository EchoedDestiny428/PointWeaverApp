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

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [paths, setPaths] = useState<{name: string, content: PathDefinition}[]>([]);
  const [currentPathName, setCurrentPathName] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCreatingPath, setIsCreatingPath] = useState(false);
  const [newPathName, setNewPathName] = useState('');
  
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

  const autoSave = async (newDef: PathDefinition) => {
    if (!projectDir || !currentPathName) return;
    
    // update local state
    const newPaths = paths.map(p => p.name === currentPathName ? { ...p, content: newDef } : p);
    setPaths(newPaths);

    // clean empty params
    const cleanDef = JSON.parse(JSON.stringify(newDef));
    if (cleanDef.points) {
      cleanDef.points.forEach((p: any) => {
        if (p.params && Object.keys(p.params).length === 0) delete p.params;
      });
    }

    // save to disk via IPC
    await (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', currentPathName, cleanDef);
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
        autoSave({ ...currentPath, points: newPoints });
        if (selectedIndex === clickedIndex) setSelectedIndex(null);
        else if (selectedIndex != null && selectedIndex > clickedIndex) setSelectedIndex(selectedIndex - 1);
      } else {
        setSelectedIndex(clickedIndex);
        setDragMode(clickedType);
      }
    } else if (e.detail === 2) {
      const newPoints = [...points];
      newPoints.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), theta: 0 });
      autoSave({ ...currentPath, points: newPoints });
      setSelectedIndex(newPoints.length - 1);
    } else {
      setSelectedIndex(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragMode && selectedIndex !== null) {
      const { x, y } = getMousePos(e);
      const newPoints = [...(currentPath.points || [])];
      const p = newPoints[selectedIndex];
      
      if (dragMode === 'position') {
        p.x = Number(Math.max(0, Math.min(FIELD_WIDTH, x)).toFixed(2));
        p.y = Number(Math.max(0, Math.min(FIELD_HEIGHT, y)).toFixed(2));
      } else if (dragMode === 'heading') {
        let deg = Math.atan2(y - p.y, x - p.x) * (180 / Math.PI);
        deg = Math.round(deg);
        p.theta = deg;
      }
      
      autoSave({ ...currentPath, points: newPoints });
    }
  };

  const handleMouseUp = () => setDragMode(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (selectedIndex === null) return;
    const p = currentPath.points?.[selectedIndex];
    if (!p || p.theta == null) return;
    
    // Allow scrolling anywhere to adjust heading of selected point, or require hovering?
    // Often it's best to just adjust if scrolling while hovering the point.
    const { x, y } = getMousePos(e);
    if (Math.hypot(p.x - x, p.y - y) < (POINT_RADIUS * 5) / PIXELS_PER_METER) {
      let delta = e.deltaY > 0 ? -5 : 5;
      let newTheta = p.theta + delta;
      if (newTheta > 180) newTheta -= 360;
      if (newTheta <= -180) newTheta += 360;
      updateSelectedPoint('theta', newTheta);
    }
  };

  const updateSelectedPoint = (field: keyof PathPoint, value: any) => {
    if (selectedIndex === null) return;
    const newPoints = [...(currentPath.points || [])];
    newPoints[selectedIndex] = { ...newPoints[selectedIndex], [field]: value };
    autoSave({ ...currentPath, points: newPoints });
  };

  const updateSelectedPointParams = (field: keyof PathParams, value: any) => {
    if (selectedIndex === null) return;
    const newPoints = [...(currentPath.points || [])];
    const p = newPoints[selectedIndex];
    const newParams = { ...(p.params || {}), [field]: value };
    newPoints[selectedIndex] = { ...p, params: newParams };
    autoSave({ ...currentPath, points: newPoints });
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
    autoSave({ ...currentPath, points: newPoints });
    setSelectedIndex(newPoints.length - 1);
  };

  const deleteSelectedWaypoint = () => {
    if (selectedIndex === null || !currentPathName) return;
    const newPoints = [...(currentPath.points || [])];
    newPoints.splice(selectedIndex, 1);
    autoSave({ ...currentPath, points: newPoints });
    setSelectedIndex(null);
  };

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
              {paths.map(p => (
                <li key={p.name} className={p.name === currentPathName ? 'active' : ''} onClick={() => {setCurrentPathName(p.name); setSelectedIndex(null);}}>
                  {p.name}.json
                </li>
              ))}
            </ul>
            {currentPathName && (
              <button className="primary-btn" style={{marginTop: '1rem', width: '100%'}} onClick={addWaypoint}>
                + Add Waypoint
              </button>
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
