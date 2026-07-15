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
const POINT_RADIUS = 8;

export default function App() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [paths, setPaths] = useState<{name: string, content: PathDefinition}[]>([]);
  const [currentPathName, setCurrentPathName] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const currentPath = paths.find(p => p.name === currentPathName)?.content || { points: [] };

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
    cleanDef.points.forEach((p: any) => {
      if (p.params && Object.keys(p.params).length === 0) delete p.params;
    });

    // save to disk via IPC
    await (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', currentPathName, cleanDef);
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < FIELD_WIDTH; x++) {
      ctx.beginPath(); ctx.moveTo(x * PIXELS_PER_METER, 0); ctx.lineTo(x * PIXELS_PER_METER, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * PIXELS_PER_METER); ctx.lineTo(canvas.width, y * PIXELS_PER_METER); ctx.stroke();
    }

    if (currentPath.points.length > 1) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < currentPath.points.length; i++) {
        const px = currentPath.points[i].x * PIXELS_PER_METER;
        const py = currentPath.points[i].y * PIXELS_PER_METER;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    for (let i = 0; i < currentPath.points.length; i++) {
      const p = currentPath.points[i];
      const px = p.x * PIXELS_PER_METER;
      const py = p.y * PIXELS_PER_METER;

      ctx.fillStyle = (i === selectedIndex) ? '#f59e0b' : '#10b981';
      ctx.beginPath();
      ctx.arc(px, py, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      if (p.theta != null) {
        ctx.strokeStyle = (i === selectedIndex) ? '#f59e0b' : '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        const rad = p.theta * (Math.PI / 180);
        ctx.lineTo(px + Math.cos(rad) * 20, py + Math.sin(rad) * 20);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const getMousePos = (evt: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / PIXELS_PER_METER;
    const y = (canvas.height - (evt.clientY - rect.top)) / PIXELS_PER_METER;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!currentPathName) return;
    const { x, y } = getMousePos(e);
    
    let clickedIndex = -1;
    for (let i = 0; i < currentPath.points.length; i++) {
      const p = currentPath.points[i];
      if (Math.hypot(p.x - x, p.y - y) < (POINT_RADIUS * 2) / PIXELS_PER_METER) {
        clickedIndex = i;
        break;
      }
    }

    if (clickedIndex !== -1) {
      if (e.shiftKey) {
        const newPoints = [...currentPath.points];
        newPoints.splice(clickedIndex, 1);
        autoSave({ ...currentPath, points: newPoints });
        if (selectedIndex === clickedIndex) setSelectedIndex(null);
        else if (selectedIndex != null && selectedIndex > clickedIndex) setSelectedIndex(selectedIndex - 1);
      } else {
        setSelectedIndex(clickedIndex);
        setIsDragging(true);
      }
    } else if (e.detail === 2) {
      const newPoints = [...currentPath.points];
      newPoints.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), theta: 0 });
      autoSave({ ...currentPath, points: newPoints });
      setSelectedIndex(newPoints.length - 1);
    } else {
      setSelectedIndex(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedIndex !== null) {
      const { x, y } = getMousePos(e);
      const newPoints = [...currentPath.points];
      newPoints[selectedIndex].x = Number(Math.max(0, Math.min(FIELD_WIDTH, x)).toFixed(2));
      newPoints[selectedIndex].y = Number(Math.max(0, Math.min(FIELD_HEIGHT, y)).toFixed(2));
      autoSave({ ...currentPath, points: newPoints });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const updateSelectedPoint = (field: keyof PathPoint, value: any) => {
    if (selectedIndex === null) return;
    const newPoints = [...currentPath.points];
    newPoints[selectedIndex] = { ...newPoints[selectedIndex], [field]: value };
    autoSave({ ...currentPath, points: newPoints });
  };

  const updateSelectedPointParams = (field: keyof PathParams, value: any) => {
    if (selectedIndex === null) return;
    const newPoints = [...currentPath.points];
    const p = newPoints[selectedIndex];
    const newParams = { ...(p.params || {}), [field]: value };
    newPoints[selectedIndex] = { ...p, params: newParams };
    autoSave({ ...currentPath, points: newPoints });
  };

  const selectFolder = async () => {
    const path = await (window as any).electronAPI.selectDir();
    if (path) setProjectDir(path);
  };

  const createNewPath = () => {
    const name = prompt("Enter path name:");
    if (!name) return;
    const def = { points: [] };
    setPaths([...paths, { name, content: def }]);
    setCurrentPathName(name);
    // this will be saved instantly if it is modified, or we can save it now
    if (projectDir) {
      (window as any).electronAPI.writePath(projectDir + '\\src\\main\\deploy\\autonomous', name, def);
    }
  };

  const selectedPoint = selectedIndex !== null && currentPath.points[selectedIndex] ? currentPath.points[selectedIndex] : null;

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
              <button className="icon-btn" onClick={createNewPath}>+</button>
            </div>
            <ul>
              {paths.map(p => (
                <li key={p.name} className={p.name === currentPathName ? 'active' : ''} onClick={() => {setCurrentPathName(p.name); setSelectedIndex(null);}}>
                  {p.name}.json
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedPoint && (
          <div className="properties-panel">
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
          </div>
        )}
      </div>

      <div className="canvas-container">
        {!projectDir ? (
          <div className="placeholder">Please select your FRC project folder.</div>
        ) : !currentPathName ? (
          <div className="placeholder">Create or select a path to begin editing.</div>
        ) : (
          <canvas 
            ref={canvasRef} 
            width={FIELD_WIDTH * PIXELS_PER_METER} 
            height={FIELD_HEIGHT * PIXELS_PER_METER}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
          />
        )}
      </div>
    </>
  );
}
