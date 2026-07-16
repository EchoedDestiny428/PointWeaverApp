import React from 'react';
import type { PathDefinition, PathParams, PathPoint } from '../../types';

export interface WaypointPropertiesProps {
  currentPathName: string | null;
  currentPath: PathDefinition;
  selectedIndex: number | null;
  selectedPoint: PathPoint | null;
  updatePathParams: (field: keyof PathParams, value: any) => void;
  updateSelectedPoint: (field: keyof PathPoint, value: any) => void;
  updateSelectedPointParams: (field: keyof PathParams, value: any) => void;
  deleteSelectedWaypoint: () => void;
}

export const WaypointProperties: React.FC<WaypointPropertiesProps> = ({
  currentPathName, currentPath, selectedIndex, selectedPoint,
  updatePathParams, updateSelectedPoint, updateSelectedPointParams, deleteSelectedWaypoint
}) => {
  if (!currentPathName) return null;

  const parseSafeFloat = (val: string) => {
    if (!val) return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  };

  if (!selectedPoint) {
    return (
      <div className="properties-panel glass-panel">
        <h3>Default Params</h3>

        <div className="input-row">
          <div className="input-group">
            <label>Max Speed</label>
            <input type="number" step="0.5" value={currentPath.params?.maxSpeed ?? ''} placeholder="3.0" onChange={(e) => updatePathParams('maxSpeed', parseSafeFloat(e.target.value))} />
          </div>
          <div className="input-group">
            <label>Min Speed</label>
            <input type="number" step="0.5" value={currentPath.params?.minSpeed ?? ''} placeholder="0.0" onChange={(e) => updatePathParams('minSpeed', parseSafeFloat(e.target.value))} />
          </div>
        </div>

        <div className="input-group">
          <label>Early Exit Range (m)</label>
          <input type="number" step="0.1" value={currentPath.params?.earlyExitRange ?? ''} placeholder="0.05" onChange={(e) => updatePathParams('earlyExitRange', parseSafeFloat(e.target.value))} />
        </div>

        <div className="input-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input type="checkbox" id="default-interpolate-checkbox" checked={currentPath.params?.interpolate ?? false} onChange={(e) => updatePathParams('interpolate', e.target.checked)} style={{ width: 'auto' }} />
          <label htmlFor="default-interpolate-checkbox" style={{ margin: 0, cursor: 'pointer' }}>Interpolate Heading</label>
        </div>
      </div>
    );
  }

  return (
    <div className="properties-panel glass-panel">
      <h3>Waypoint {selectedIndex}</h3>

      <div className="input-row">
        <div className="input-group">
          <label>X (m)</label>
          <input type="number" step="0.1" value={selectedPoint.x} onChange={(e) => updateSelectedPoint('x', parseFloat(e.target.value) || 0)} />
        </div>
        <div className="input-group">
          <label>Y (m)</label>
          <input type="number" step="0.1" value={selectedPoint.y} onChange={(e) => updateSelectedPoint('y', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="input-group">
        <label>Heading (deg)</label>
        <div className="checkbox-input">
          <input type="checkbox" checked={selectedPoint.theta != null} onChange={(e) => updateSelectedPoint('theta', e.target.checked ? 0 : null)} />
          <input type="number" step="1" disabled={selectedPoint.theta == null} value={selectedPoint.theta ?? ''} onChange={(e) => updateSelectedPoint('theta', parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
        </div>
      </div>

      <div className="input-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0 }}>Events</h4>
          <button className="secondary-btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }} onClick={() => {
            const newEvents = [...(selectedPoint.events || []), { name: 'new_event', fraction: 0.0 }];
            updateSelectedPoint('events', newEvents);
          }}>+ Add Event</button>
        </div>
        
        {(selectedPoint.events || []).map((ev, i) => {
          const isLastPoint = selectedIndex === (currentPath.points?.length || 0) - 1;
          return (
            <div key={i} className="event-item">
              <div className="event-row">
                <input type="text" value={ev.name} onChange={(e) => {
                  const arr = [...selectedPoint.events!];
                  arr[i].name = e.target.value;
                  updateSelectedPoint('events', arr);
                }} placeholder="Event name" />
                <button className="danger-btn" style={{ margin: 0, padding: '0.5rem 0.75rem' }} onClick={() => {
                  const arr = [...selectedPoint.events!];
                  arr.splice(i, 1);
                  updateSelectedPoint('events', arr.length > 0 ? arr : null);
                }}>X</button>
              </div>
              <div className="event-slider-container">
                <input 
                  type="range" 
                  step="0.01" 
                  min="0" 
                  max="1" 
                  disabled={isLastPoint}
                  value={isLastPoint ? 0.0 : ev.fraction} 
                  onChange={(e) => {
                    const arr = [...selectedPoint.events!];
                    arr[i].fraction = parseFloat(e.target.value);
                    updateSelectedPoint('events', arr);
                  }} 
                />
                <span className="event-fraction-label">{Math.round((isLastPoint ? 0 : ev.fraction) * 100)}%</span>
              </div>
              {isLastPoint && <span className="event-warning">Last point events fire upon arrival.</span>}
            </div>
          )
        })}
      </div>

      <div className="divider"></div>
      <h4>Overrides</h4>

      <div className="input-row">
        <div className="input-group">
          <label>Max Speed</label>
          <input type="number" step="0.5" value={selectedPoint.params?.maxSpeed ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('maxSpeed', parseSafeFloat(e.target.value))} />
        </div>
        <div className="input-group">
          <label>Min Speed</label>
          <input type="number" step="0.5" value={selectedPoint.params?.minSpeed ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('minSpeed', parseSafeFloat(e.target.value))} />
        </div>
      </div>

      <div className="input-group">
        <label>Early Exit Range (m)</label>
        <input type="number" step="0.1" value={selectedPoint.params?.earlyExitRange ?? ''} placeholder="Auto" onChange={(e) => updateSelectedPointParams('earlyExitRange', parseSafeFloat(e.target.value))} />
      </div>

      <div className="input-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <input type="checkbox" id="interpolate-checkbox" checked={selectedPoint.params?.interpolate ?? false} onChange={(e) => updateSelectedPointParams('interpolate', e.target.checked)} style={{ width: 'auto' }} />
        <label htmlFor="interpolate-checkbox" style={{ margin: 0, cursor: 'pointer' }}>Interpolate Heading</label>
      </div>

      <button className="danger-btn" onClick={deleteSelectedWaypoint}>
        Delete Waypoint
      </button>
    </div>
  );
};
