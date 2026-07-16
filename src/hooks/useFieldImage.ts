import { useState, useEffect } from 'react';
import { FIELD_WIDTH, FIELD_HEIGHT } from '../constants';

export function useFieldImage(projectDir: string | null) {
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgImgObj, setBgImgObj] = useState<HTMLImageElement | null>(null);
  const [bgWidth, setBgWidth] = useState(FIELD_WIDTH);
  const [bgHeight, setBgHeight] = useState(FIELD_HEIGHT);
  const [bgOffsetX, setBgOffsetX] = useState(0);
  const [bgOffsetY, setBgOffsetY] = useState(0);
  const [isEditingBg, setIsEditingBg] = useState(false);

  useEffect(() => {
    if (bgImage) {
      const img = new Image();
      img.onload = () => setBgImgObj(img);
      img.src = bgImage;
    } else {
      setBgImgObj(null);
    }
  }, [bgImage]);

  useEffect(() => {
    if (projectDir) {
      const savedBg = localStorage.getItem(`bg_${projectDir}`);
      if (savedBg) setBgImage(savedBg);
      else setBgImage(null);

      const savedW = localStorage.getItem(`bgWidth_${projectDir}`);
      if (savedW) setBgWidth(parseFloat(savedW));
      else setBgWidth(FIELD_WIDTH);

      const savedH = localStorage.getItem(`bgHeight_${projectDir}`);
      if (savedH) setBgHeight(parseFloat(savedH));
      else setBgHeight(FIELD_HEIGHT);

      const savedX = localStorage.getItem(`bgOffsetX_${projectDir}`);
      if (savedX) setBgOffsetX(parseFloat(savedX));
      else setBgOffsetX(0);

      const savedY = localStorage.getItem(`bgOffsetY_${projectDir}`);
      if (savedY) setBgOffsetY(parseFloat(savedY));
      else setBgOffsetY(0);
    } else {
      setBgImage(null);
    }
  }, [projectDir]);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const clearBgImage = () => {
    setBgImage(null);
    if (projectDir) {
      localStorage.removeItem(`bg_${projectDir}`);
    }
  };

  return {
    bgImage, setBgImage,
    bgImgObj, setBgImgObj,
    bgWidth, setBgWidth,
    bgHeight, setBgHeight,
    bgOffsetX, setBgOffsetX,
    bgOffsetY, setBgOffsetY,
    isEditingBg, setIsEditingBg,
    updateBgConfig, selectBgImage,
    handleDrop, handleDragOver,
    clearBgImage
  };
}
