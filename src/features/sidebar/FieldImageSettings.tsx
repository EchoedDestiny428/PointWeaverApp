import React from 'react';


export interface FieldImageSettingsProps {
  bgWidth: number;
  bgHeight: number;
  bgOffsetX: number;
  bgOffsetY: number;
  isEditingBg: boolean;
  setIsEditingBg: (val: boolean) => void;
  updateBgConfig: (key: string, value: number) => void;
}

export const FieldImageSettings: React.FC<FieldImageSettingsProps> = ({
  bgWidth, bgHeight, bgOffsetX, bgOffsetY, isEditingBg, setIsEditingBg, updateBgConfig
}) => {
  return (
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
  );
};
