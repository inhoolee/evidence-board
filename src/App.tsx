import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { 
  FolderHeart, 
  Search, 
  Settings, 
  FileText, 
  Camera, 
  Lightbulb,
  Link as LinkIcon, 
  Bookmark, 
  Plus, 
  Minus, 
  Maximize,
  Pin,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
import { Connection, EvidenceItem, EvidenceType, Position } from './types';

type BackgroundTheme = 'white' | 'glass' | 'woody';
type ItemSize = { width: number; height: number };
type ItemGeometry = {
  center: Position;
  halfWidth: number;
  halfHeight: number;
  rotationRad: number;
};
type CameraState = {
  zoom: number;
  pan: Position;
};
type CanvasSize = {
  width: number;
  height: number;
};
type BoardBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
type ViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const BOARD_THEME_STORAGE_KEY = 'evidence-board-background-theme';
const BOARD_LAMP_STORAGE_KEY = 'evidence-board-lamp-enabled';
const SAFE_AREA_INSET = 56;
const BOARD_PADDING = 180;
const DEFAULT_ZOOM = 0.625;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const DEFAULT_BOARD_SIZE: CanvasSize = { width: 1200, height: 800 };
const ITEM_FALLBACK_SIZES: Record<EvidenceType, ItemSize> = {
  photo: { width: 256, height: 304 },
  note: { width: 192, height: 192 },
  report: { width: 320, height: 224 },
};

const BACKGROUND_THEMES: Array<{ id: BackgroundTheme; label: string; accent: string }> = [
  { id: 'white', label: 'White', accent: 'bg-stone-100' },
  { id: 'glass', label: 'Glass', accent: 'bg-cyan-200/80' },
  { id: 'woody', label: 'Woody', accent: 'bg-amber-500' },
];

const INITIAL_ITEMS: EvidenceItem[] = [
  {
    id: '1',
    type: 'photo',
    title: 'Primary Entry Point',
    fileNumber: 'File #88-Alpha',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1000&auto=format&fit=crop',
    imageSource: 'remote',
    rotation: -1,
    position: { x: 150, y: 100 },
    pinColor: '#ef4444' // red-600
  },
  {
    id: '2',
    type: 'note',
    title: 'Witness Statement',
    content: '"The watchman wasn\'t at his post between 02:00 and 02:30."',
    rotation: 2,
    position: { x: 580, y: 350 },
    pinColor: '#2563eb' // blue-600
  },
  {
    id: '3',
    type: 'report',
    title: 'Forensic Lab Report',
    fileNumber: 'CASE ID: NIGHTSHADE-7',
    content: 'Analysis confirms presence of Unidentified Residue on the handle of the briefcase recovered from scene.',
    rotation: 0.5,
    position: { x: 250, y: 500 },
    pinColor: '#1e293b' // slate-800
  }
];

const INITIAL_CONNECTIONS: Connection[] = [
  { id: 'c1', fromId: '1', toId: '2' },
  { id: 'c2', fromId: '2', toId: '3' },
  { id: 'c3', fromId: '1', toId: '3' }
];

const SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1520637836862-4d197d17c35a?q=80&w=1000&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?q=80&w=1000&auto=format&fit=crop'
];

const isBackgroundTheme = (value: string | null): value is BackgroundTheme =>
  value === 'white' || value === 'glass' || value === 'woody';

const clamp = (value: number, min: number, max: number) => {
  if (min > max) {
    return (min + max) / 2;
  }

  return Math.min(Math.max(value, min), max);
};

const getRotatedExtents = (width: number, height: number, radians: number) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: Math.abs(cos) * halfWidth + Math.abs(sin) * halfHeight,
    y: Math.abs(sin) * halfWidth + Math.abs(cos) * halfHeight,
  };
};

const getConnectionEndpoint = (geometry: ItemGeometry, targetCenter: Position): Position => {
  const dx = targetCenter.x - geometry.center.x;
  const dy = targetCenter.y - geometry.center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return geometry.center;
  }

  const cos = Math.cos(geometry.rotationRad);
  const sin = Math.sin(geometry.rotationRad);
  const localDx = dx * cos + dy * sin;
  const localDy = -dx * sin + dy * cos;
  const scale = 1 / Math.max(Math.abs(localDx) / geometry.halfWidth, Math.abs(localDy) / geometry.halfHeight);
  const localX = localDx * scale;
  const localY = localDy * scale;

  return {
    x: geometry.center.x + localX * cos - localY * sin,
    y: geometry.center.y + localX * sin + localY * cos,
  };
};

const arePositionsEqual = (a: Position, b: Position) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

const getViewportRect = (camera: CameraState, canvasSize: CanvasSize): ViewportRect => {
  const zoom = camera.zoom || 1;

  return {
    x: -camera.pan.x / zoom,
    y: -camera.pan.y / zoom,
    width: canvasSize.width / zoom,
    height: canvasSize.height / zoom,
  };
};

const getBoardBounds = (items: EvidenceItem[], itemSizes: Record<string, ItemSize>): BoardBounds => {
  if (!items.length) {
    return {
      minX: -BOARD_PADDING,
      minY: -BOARD_PADDING,
      maxX: DEFAULT_BOARD_SIZE.width + BOARD_PADDING,
      maxY: DEFAULT_BOARD_SIZE.height + BOARD_PADDING,
      width: DEFAULT_BOARD_SIZE.width + BOARD_PADDING * 2,
      height: DEFAULT_BOARD_SIZE.height + BOARD_PADDING * 2,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  items.forEach(item => {
    const size = itemSizes[item.id] ?? ITEM_FALLBACK_SIZES[item.type];
    const rotationRad = (item.rotation * Math.PI) / 180;
    const rotatedExtents = getRotatedExtents(size.width, size.height, rotationRad);
    const centerX = item.position.x + size.width / 2;
    const centerY = item.position.y + size.height / 2;

    minX = Math.min(minX, centerX - rotatedExtents.x);
    minY = Math.min(minY, centerY - rotatedExtents.y);
    maxX = Math.max(maxX, centerX + rotatedExtents.x);
    maxY = Math.max(maxY, centerY + rotatedExtents.y);
  });

  return {
    minX: minX - BOARD_PADDING,
    minY: minY - BOARD_PADDING,
    maxX: maxX + BOARD_PADDING,
    maxY: maxY + BOARD_PADDING,
    width: maxX - minX + BOARD_PADDING * 2,
    height: maxY - minY + BOARD_PADDING * 2,
  };
};

export default function App() {
  const [items, setItems] = useState<EvidenceItem[]>(INITIAL_ITEMS);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [itemSizes, setItemSizes] = useState<Record<string, ItemSize>>({});
  const [camera, setCamera] = useState<CameraState>({
    zoom: DEFAULT_ZOOM,
    pan: { x: 0, y: 0 },
  });
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundTheme>(() => {
    if (typeof window === 'undefined') {
      return 'woody';
    }

    const storedTheme = window.localStorage.getItem(BOARD_THEME_STORAGE_KEY);
    return isBackgroundTheme(storedTheme) ? storedTheme : 'woody';
  });
  const [isLampOn, setIsLampOn] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const storedLampState = window.localStorage.getItem(BOARD_LAMP_STORAGE_KEY);
    return storedLampState === null ? true : storedLampState === 'true';
  });
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragAtBoundary, setIsDragAtBoundary] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const itemsRef = useRef(items);
  const idCounterRef = useRef(INITIAL_ITEMS.length + 1);
  const connectionCounterRef = useRef(INITIAL_CONNECTIONS.length + 1);
  const activeDragRef = useRef<{ id: string; pointerStart: Position; itemStart: Position } | null>(null);
  const activePanRef = useRef<{ pointerStart: Position; panStart: Position } | null>(null);
  const cameraRef = useRef(camera);
  const canvasSizeRef = useRef(canvasSize);
  const dragHandlersRef = useRef<{ onMove: (event: PointerEvent) => void; onUp: () => void } | null>(null);
  const panHandlersRef = useRef<{ onMove: (event: PointerEvent) => void; onUp: () => void } | null>(null);
  const measurementSignature = items
    .map(item => `${item.id}:${item.type}:${item.title}:${item.fileNumber ?? ''}:${item.content ?? ''}:${item.imageUrl ?? ''}`)
    .join('|');

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  const measureItemSizes = useCallback(() => {
    setItemSizes(prev => {
      let changed = Object.keys(prev).length !== itemsRef.current.length;
      const nextSizes: Record<string, ItemSize> = {};

      itemsRef.current.forEach(item => {
        const node = evidenceRefs.current[item.id];
        const nextSize = node
          ? { width: node.offsetWidth, height: node.offsetHeight }
          : prev[item.id] ?? ITEM_FALLBACK_SIZES[item.type];

        nextSizes[item.id] = nextSize;

        const currentSize = prev[item.id];
        if (!currentSize || currentSize.width !== nextSize.width || currentSize.height !== nextSize.height) {
          changed = true;
        }
      });

      return changed ? nextSizes : prev;
    });
  }, []);

  useLayoutEffect(() => {
    measureItemSizes();
  }, [measureItemSizes, measurementSignature]);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) {
      return;
    }

    const updateCanvasSize = () => {
      const nextSize = {
        width: canvasNode.clientWidth,
        height: canvasNode.clientHeight,
      };

      setCanvasSize(prev =>
        prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
      );
      measureItemSizes();
    };

    updateCanvasSize();

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });

    observer.observe(canvasNode);

    return () => observer.disconnect();
  }, [measureItemSizes]);

  useEffect(() => {
    window.localStorage.setItem(BOARD_THEME_STORAGE_KEY, backgroundTheme);
  }, [backgroundTheme]);

  useEffect(() => {
    window.localStorage.setItem(BOARD_LAMP_STORAGE_KEY, String(isLampOn));
  }, [isLampOn]);

  const removeDragListeners = useCallback(() => {
    const handlers = dragHandlersRef.current;
    if (!handlers) return;

    window.removeEventListener('pointermove', handlers.onMove);
    window.removeEventListener('pointerup', handlers.onUp);
    window.removeEventListener('pointercancel', handlers.onUp);
    dragHandlersRef.current = null;
  }, []);

  const removePanListeners = useCallback(() => {
    const handlers = panHandlersRef.current;
    if (!handlers) return;

    window.removeEventListener('pointermove', handlers.onMove);
    window.removeEventListener('pointerup', handlers.onUp);
    window.removeEventListener('pointercancel', handlers.onUp);
    panHandlersRef.current = null;
  }, []);

  const getItemSize = useCallback((item: EvidenceItem): ItemSize => {
    return itemSizes[item.id] ?? ITEM_FALLBACK_SIZES[item.type];
  }, [itemSizes]);

  const boardBounds = useMemo(() => getBoardBounds(items, itemSizes), [items, itemSizes]);
  const viewportRect = useMemo(() => getViewportRect(camera, canvasSize), [camera, canvasSize]);

  const getItemGeometry = useCallback((id: string): ItemGeometry | null => {
    const item = items.find(entry => entry.id === id);
    if (!item) {
      return null;
    }

    const size = getItemSize(item);
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;
    const rotationRad = (item.rotation * Math.PI) / 180;

    return {
      center: {
        x: item.position.x + halfWidth,
        y: item.position.y + halfHeight,
      },
      halfWidth,
      halfHeight,
      rotationRad,
    };
  }, [getItemSize, items]);

  const getConnectionLine = useCallback((connection: Connection) => {
    const fromGeometry = getItemGeometry(connection.fromId);
    const toGeometry = getItemGeometry(connection.toId);

    if (!fromGeometry || !toGeometry) {
      return null;
    }

    const from = getConnectionEndpoint(fromGeometry, toGeometry.center);
    const to = getConnectionEndpoint(toGeometry, fromGeometry.center);

    return {
      from,
      to,
      midpoint: {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
      },
    };
  }, [getItemGeometry]);

  const clampItemPosition = useCallback((item: EvidenceItem, nextPosition: Position) => {
    const currentCamera = cameraRef.current;
    const currentCanvasSize = canvasSizeRef.current.width > 0 && canvasSizeRef.current.height > 0
      ? canvasSizeRef.current
      : DEFAULT_BOARD_SIZE;
    const viewport = getViewportRect(currentCamera, currentCanvasSize);
    const size = getItemSize(item);
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;
    const rotationRad = (item.rotation * Math.PI) / 180;
    const rotatedExtents = getRotatedExtents(size.width, size.height, rotationRad);
    const safeInset = SAFE_AREA_INSET / currentCamera.zoom;
    const nextCenterX = nextPosition.x + halfWidth;
    const nextCenterY = nextPosition.y + halfHeight;
    const clampedCenterX = clamp(
      nextCenterX,
      viewport.x + safeInset + rotatedExtents.x,
      viewport.x + viewport.width - safeInset - rotatedExtents.x
    );
    const clampedCenterY = clamp(
      nextCenterY,
      viewport.y + safeInset + rotatedExtents.y,
      viewport.y + viewport.height - safeInset - rotatedExtents.y
    );

    return {
      position: {
        x: clampedCenterX - halfWidth,
        y: clampedCenterY - halfHeight,
      },
      hitBoundary: Math.abs(clampedCenterX - nextCenterX) > 0.01 || Math.abs(clampedCenterY - nextCenterY) > 0.01,
    };
  }, [getItemSize]);

  useEffect(() => {
    return () => {
      activeDragRef.current = null;
      activePanRef.current = null;
      removeDragListeners();
      removePanListeners();
      itemsRef.current.forEach(item => {
        if (item.imageSource === 'upload' && item.imageUrl) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
    };
  }, [removeDragListeners, removePanListeners]);

  const cancelLinkMode = useCallback(() => {
    setIsLinkMode(false);
    setLinkSourceId(null);
    setSelectedConnectionId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isLinkMode) {
          cancelLinkMode();
          return;
        }

        setSelectedConnectionId(null);
        return;
      }

      if (!selectedConnectionId) return;

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        setConnections(prev => prev.filter(connection => connection.id !== selectedConnectionId));
        setSelectedConnectionId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelLinkMode, isLinkMode, selectedConnectionId]);

  const createConnection = useCallback((fromId: string, toId: string) => {
    setConnections(prev => {
      const exists = prev.some(
        connection =>
          (connection.fromId === fromId && connection.toId === toId) ||
          (connection.fromId === toId && connection.toId === fromId)
      );

      if (exists) {
        return prev;
      }

      return [
        ...prev,
        {
          id: `c${connectionCounterRef.current++}`,
          fromId,
          toId,
        },
      ];
    });
  }, []);

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(connection => connection.id !== id));
    setSelectedConnectionId(prev => (prev === id ? null : prev));
  }, []);

  const handleLinkSelection = useCallback((id: string) => {
    if (!isLinkMode) return;

    if (!linkSourceId) {
      setLinkSourceId(id);
      return;
    }

    if (linkSourceId === id) {
      setLinkSourceId(null);
      return;
    }

    createConnection(linkSourceId, id);
    cancelLinkMode();
  }, [cancelLinkMode, createConnection, isLinkMode, linkSourceId]);

  const handleItemPointerDown = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.stopPropagation();

    if (isLinkMode) {
      event.preventDefault();
      handleLinkSelection(id);
      return;
    }

    const item = items.find(i => i.id === id);
    if (!item) return;

    event.preventDefault();
    setSelectedConnectionId(null);
    setActiveDragId(id);
    setIsDragAtBoundary(false);
    measureItemSizes();

    activeDragRef.current = {
      id,
      pointerStart: { x: event.clientX, y: event.clientY },
      itemStart: { ...item.position },
    };

    activePanRef.current = null;
    setIsPanning(false);
    removePanListeners();
    removeDragListeners();

    const onMove = (moveEvent: PointerEvent) => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) return;
      const draggedItem = itemsRef.current.find(prevItem => prevItem.id === activeDrag.id);
      if (!draggedItem) return;

      const zoomScale = cameraRef.current.zoom || 1;
      const unclampedPosition = {
        x: activeDrag.itemStart.x + (moveEvent.clientX - activeDrag.pointerStart.x) / zoomScale,
        y: activeDrag.itemStart.y + (moveEvent.clientY - activeDrag.pointerStart.y) / zoomScale,
      };
      const { position: nextPosition, hitBoundary } = clampItemPosition(draggedItem, unclampedPosition);

      setIsDragAtBoundary(hitBoundary);

      setItems(prev =>
        prev.map(prevItem =>
          prevItem.id === activeDrag.id
            ? { ...prevItem, position: nextPosition }
            : prevItem
        )
      );
    };

    const onUp = () => {
      activeDragRef.current = null;
      setActiveDragId(null);
      setIsDragAtBoundary(false);
      removeDragListeners();
    };

    dragHandlersRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleLinkModeToggle = () => {
    activeDragRef.current = null;
    activePanRef.current = null;
    setActiveDragId(null);
    setIsDragAtBoundary(false);
    setIsPanning(false);
    removeDragListeners();
    removePanListeners();
    setSelectedConnectionId(null);

    if (isLinkMode) {
      cancelLinkMode();
      return;
    }

    setLinkSourceId(null);
    setIsLinkMode(true);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const clickedCanvas =
      event.target === event.currentTarget || event.target instanceof SVGSVGElement;

    if (!clickedCanvas) return;

    event.preventDefault();

    if (isLinkMode) {
      cancelLinkMode();
      return;
    }

    setSelectedConnectionId(null);
    activeDragRef.current = null;
    setActiveDragId(null);
    setIsDragAtBoundary(false);
    removeDragListeners();
    removePanListeners();
    setIsPanning(true);

    activePanRef.current = {
      pointerStart: { x: event.clientX, y: event.clientY },
      panStart: { ...cameraRef.current.pan },
    };

    const onMove = (moveEvent: PointerEvent) => {
      const activePan = activePanRef.current;
      if (!activePan) return;

      const unclampedPan = {
        x: activePan.panStart.x + (moveEvent.clientX - activePan.pointerStart.x),
        y: activePan.panStart.y + (moveEvent.clientY - activePan.pointerStart.y),
      };

      setCamera(prev => (arePositionsEqual(prev.pan, unclampedPan) ? prev : { ...prev, pan: unclampedPan }));
    };

    const onUp = () => {
      activePanRef.current = null;
      setIsPanning(false);
      removePanListeners();
    };

    panHandlersRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleConnectionPointerDown = (id: string, event: React.PointerEvent<SVGLineElement>) => {
    if (event.button !== 0 || isLinkMode) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedConnectionId(id);
  };

  const getDefaultPosition = (): Position => {
    const jitter = 80;
    const currentViewport = getViewportRect(
      cameraRef.current,
      canvasSizeRef.current.width > 0 && canvasSizeRef.current.height > 0
        ? canvasSizeRef.current
        : DEFAULT_BOARD_SIZE
    );

    return {
      x: currentViewport.x + currentViewport.width / 2 - 140 + (Math.random() * jitter - jitter / 2),
      y: currentViewport.y + currentViewport.height / 2 - 120 + (Math.random() * jitter - jitter / 2),
    };
  };

  const setZoomLevel = (nextZoom: number) => {
    setCamera(prev => {
      const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(prev.zoom - zoom) < 0.001) {
        return prev;
      }

      const currentCanvasSize = canvasSizeRef.current.width > 0 && canvasSizeRef.current.height > 0
        ? canvasSizeRef.current
        : DEFAULT_BOARD_SIZE;
      const currentViewport = getViewportRect(prev, currentCanvasSize);
      const centerX = currentViewport.x + currentViewport.width / 2;
      const centerY = currentViewport.y + currentViewport.height / 2;
      const nextViewportWidth = currentCanvasSize.width / zoom;
      const nextViewportHeight = currentCanvasSize.height / zoom;
      const nextPan = {
        x: -(centerX - nextViewportWidth / 2) * zoom,
        y: -(centerY - nextViewportHeight / 2) * zoom,
      };

      return {
        zoom,
        pan: nextPan,
      };
    });
  };

  const getRotation = () => Number(((Math.random() - 0.5) * 6).toFixed(2));

  const getUploadTitle = (fileName: string) => {
    const trimmedName = fileName.trim();
    const extensionIndex = trimmedName.lastIndexOf('.');

    if (extensionIndex <= 0) {
      return trimmedName || 'Uploaded Evidence';
    }

    const baseName = trimmedName.slice(0, extensionIndex).trim();
    return baseName || 'Uploaded Evidence';
  };

  const addEvidence = (type: EvidenceType) => {
    const id = String(idCounterRef.current++);
    const position = getDefaultPosition();
    const rotation = getRotation();

    setItems(prev => {
      const sequence = prev.filter(item => item.type === type).length + 1;

      if (type === 'note') {
        return [
          ...prev,
          {
            id,
            type: 'note',
            title: `Witness Note ${sequence}`,
            content: 'Cross-check alibi timeline with downtown CCTV archives.',
            rotation,
            position,
            pinColor: '#2563eb',
          },
        ];
      }

      if (type === 'report') {
        return [
          ...prev,
          {
            id,
            type: 'report',
            title: `Lab Report ${sequence}`,
            fileNumber: `CASE ID: NIGHTSHADE-${100 + sequence}`,
            content: 'Supplemental lab pass indicates trace fibers consistent with vehicle trunk lining.',
            rotation,
            position,
            pinColor: '#1e293b',
          },
        ];
      }

      return [
        ...prev,
        {
          id,
          type: 'photo',
          title: `Scene Photo ${sequence}`,
          fileNumber: `File #${80 + sequence}-Echo`,
          imageUrl: SAMPLE_PHOTOS[(sequence - 1) % SAMPLE_PHOTOS.length],
          imageSource: 'remote',
          rotation,
          position,
          pinColor: '#ef4444',
        },
      ];
    });
  };

  const handlePhotoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (file.type && !file.type.startsWith('image/')) {
      input.value = '';
      return;
    }

    const id = String(idCounterRef.current++);
    const position = getDefaultPosition();
    const rotation = getRotation();
    const imageUrl = URL.createObjectURL(file);

    setItems(prev => {
      const sequence = prev.filter(item => item.type === 'photo').length + 1;

      return [
        ...prev,
        {
          id,
          type: 'photo',
          title: getUploadTitle(file.name),
          fileNumber: `File #${80 + sequence}-Echo`,
          imageUrl,
          imageSource: 'upload',
          rotation,
          position,
          pinColor: '#ef4444',
        },
      ];
    });

    input.value = '';
  };

  const removeEvidence = (id: string) => {
    const itemToRemove = itemsRef.current.find(item => item.id === id);

    if (itemToRemove?.imageSource === 'upload' && itemToRemove.imageUrl) {
      URL.revokeObjectURL(itemToRemove.imageUrl);
    }

    delete evidenceRefs.current[id];
    setItems(prev => prev.filter(item => item.id !== id));
    setItemSizes(prev => {
      if (!prev[id]) return prev;

      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConnections(prev => prev.filter(conn => conn.fromId !== id && conn.toId !== id));
    setSelectedConnectionId(prev => {
      if (!prev) return prev;

      const selectedConnection = connections.find(connection => connection.id === prev);
      if (!selectedConnection) return null;

      return selectedConnection.fromId === id || selectedConnection.toId === id ? null : prev;
    });
    setLinkSourceId(prev => prev === id ? null : prev);
    setActiveDragId(prev => prev === id ? null : prev);
    setIsDragAtBoundary(false);
  };

  const selectedConnection = selectedConnectionId
    ? connections.find(connection => connection.id === selectedConnectionId) ?? null
    : null;
  const selectedConnectionLine = selectedConnection ? getConnectionLine(selectedConnection) : null;
  const selectedConnectionMidpoint = selectedConnectionLine?.midpoint ?? null;
  const boardOrigin = useMemo(
    () => ({ x: boardBounds.minX, y: boardBounds.minY }),
    [boardBounds.minX, boardBounds.minY]
  );
  const zoom = camera.zoom;
  const minimapItems = useMemo(() => {
    return items.map(item => {
      const size = getItemSize(item);
      const rotationRad = (item.rotation * Math.PI) / 180;
      const rotatedExtents = getRotatedExtents(size.width, size.height, rotationRad);
      const centerX = item.position.x + size.width / 2;
      const centerY = item.position.y + size.height / 2;
      const left = ((centerX - rotatedExtents.x - boardBounds.minX) / boardBounds.width) * 100;
      const top = ((centerY - rotatedExtents.y - boardBounds.minY) / boardBounds.height) * 100;
      const width = ((rotatedExtents.x * 2) / boardBounds.width) * 100;
      const height = ((rotatedExtents.y * 2) / boardBounds.height) * 100;

      return {
        id: item.id,
        left: `${clamp(left, 0, 100)}%`,
        top: `${clamp(top, 0, 100)}%`,
        width: `${clamp(width, 1.2, 100)}%`,
        height: `${clamp(height, 1.2, 100)}%`,
        className:
          item.type === 'note'
            ? 'border-yellow-100/30 bg-yellow-100/12'
            : item.type === 'report'
              ? 'border-slate-100/25 bg-slate-100/12'
              : 'border-white/25 bg-white/12',
      };
    });
  }, [boardBounds, getItemSize, items]);
  const minimapViewportStyle = useMemo(() => {
    const visibleMinX = Math.max(viewportRect.x, boardBounds.minX);
    const visibleMinY = Math.max(viewportRect.y, boardBounds.minY);
    const visibleMaxX = Math.min(viewportRect.x + viewportRect.width, boardBounds.maxX);
    const visibleMaxY = Math.min(viewportRect.y + viewportRect.height, boardBounds.maxY);
    const left = ((visibleMinX - boardBounds.minX) / boardBounds.width) * 100;
    const top = ((visibleMinY - boardBounds.minY) / boardBounds.height) * 100;
    const width = ((Math.max(visibleMaxX - visibleMinX, 0)) / boardBounds.width) * 100;
    const height = ((Math.max(visibleMaxY - visibleMinY, 0)) / boardBounds.height) * 100;

    return {
      left: `${clamp(left, 0, 100)}%`,
      top: `${clamp(top, 0, 100)}%`,
      width: `${clamp(width, 0, 100)}%`,
      height: `${clamp(height, 0, 100)}%`,
    };
  }, [boardBounds, viewportRect]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-dark font-sans text-slate-100">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-white/5 bg-black/40 px-6 backdrop-blur-xl z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <FolderHeart className="text-white/80 w-8 h-8" />
            <h2 className="text-lg font-bold tracking-tight text-white/90">Project: Nightshade</h2>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a className="text-sm font-medium text-white underline decoration-evidence-red underline-offset-4" href="#">Evidence Board</a>
            <a className="text-sm font-medium text-slate-400 hover:text-white transition-colors" href="#">Timeline</a>
            <a className="text-sm font-medium text-slate-400 hover:text-white transition-colors" href="#">Profiles</a>
          </nav>
        </div>
        
        <div className="flex flex-1 justify-end gap-4 items-center">
          <div className="relative max-w-xs w-full hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
            <input 
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-white/20 placeholder:text-slate-600 outline-none" 
              placeholder="Search case files..." 
              type="text"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              <Settings className="w-5 h-5" />
            </button>
            <div className="ml-2 h-8 w-8 rounded-full border border-white/20 flex items-center justify-center overflow-hidden">
              <img 
                className="w-full h-full object-cover" 
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop" 
                alt="User"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/5 bg-black/30 backdrop-blur-xl p-4 flex flex-col gap-6 z-40">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-3">Case Tools</h3>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => addEvidence('note')}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/10 text-white font-medium transition-all group border border-white/5"
              >
                <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">New Note</span>
              </button>
              <button
                onClick={handlePhotoUploadClick}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-all group"
              >
                <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Add Evidence</span>
              </button>
              <button
                onClick={handleLinkModeToggle}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group border ${
                  isLinkMode
                    ? 'border-evidence-red/50 bg-evidence-red/15 text-white shadow-[0_0_18px_rgba(255,46,46,0.18)]'
                    : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <LinkIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">{isLinkMode ? 'Cancel Linking' : 'Link Items'}</span>
              </button>
              <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-all group">
                <Bookmark className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Categories</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-3">Background</h3>
            <div className="grid grid-cols-3 gap-2">
              {BACKGROUND_THEMES.map(theme => {
                const isActive = theme.id === backgroundTheme;

                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setBackgroundTheme(theme.id)}
                    className={`rounded-xl border px-2 py-3 text-left transition-all ${
                      isActive
                        ? 'border-evidence-red/50 bg-white/10 shadow-[0_0_20px_rgba(255,46,46,0.14)]'
                        : 'border-white/8 bg-white/4 hover:border-white/15 hover:bg-white/8'
                    }`}
                  >
                    <span className={`mb-2 block h-8 rounded-lg border border-black/5 ${theme.accent}`}></span>
                    <span className="block text-xs font-semibold text-white">{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-3">Lighting</h3>
            <button
              type="button"
              aria-pressed={isLampOn}
              onClick={() => setIsLampOn(prev => !prev)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-300 ${
                isLampOn
                  ? 'border-amber-300/35 bg-amber-200/10 text-white shadow-[0_0_28px_rgba(251,191,36,0.16)]'
                  : 'border-white/8 bg-white/4 text-slate-300 hover:border-white/15 hover:bg-white/8'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-300 ${
                  isLampOn
                    ? 'border-amber-200/40 bg-amber-100/12 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 bg-black/20 text-slate-500'
                }`}
              >
                <Lightbulb className={`h-5 w-5 transition-all duration-300 ${isLampOn ? 'fill-current' : ''}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{isLampOn ? 'Investigation Lamp On' : 'Investigation Lamp Off'}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {isLampOn ? 'Warm spotlight with dark vignette.' : 'Board lighting returned to neutral.'}
                </span>
              </span>
            </button>
          </div>
          
          <div className="mt-auto">
            <div className="p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-[10px] font-medium text-slate-500 mb-2 uppercase tracking-tight">Active Investigation</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                <span className="text-xs font-semibold text-slate-300">Recording Evidence</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Canvas Area */}
        <main 
          className={`board-lamp-scene flex-1 relative canvas-grain board-theme-${backgroundTheme} overflow-hidden ${
            isLampOn ? 'board-lamp-scene-on' : ''
          } ${
            isLinkMode ? 'cursor-default' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          ref={canvasRef}
        >
          <div
            aria-hidden="true"
            className={`board-lamp-layer board-lamp-glow ${isLampOn ? 'board-lamp-layer-on' : ''}`}
          />
          <div
            aria-hidden="true"
            className={`board-lamp-layer board-lamp-vignette ${isLampOn ? 'board-lamp-layer-on' : ''}`}
          />

          {activeDragId && (
            <div
              aria-hidden="true"
              className={`board-safe-area pointer-events-none absolute z-[15] rounded-[32px] ${
                isDragAtBoundary ? 'board-safe-area-locked' : ''
              }`}
              style={{
                top: SAFE_AREA_INSET,
                right: SAFE_AREA_INSET,
                bottom: SAFE_AREA_INSET,
                left: SAFE_AREA_INSET,
              }}
            />
          )}

          <motion.div 
            className="absolute inset-0 z-10 w-full h-full"
            style={{
              transform: `translate(${camera.pan.x}px, ${camera.pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              touchAction: 'none',
            }}
            onPointerDown={handleCanvasPointerDown}
          >
            {/* Yarn Connections */}
            <div
              className="pointer-events-none absolute z-10"
              style={{
                left: boardOrigin.x,
                top: boardOrigin.y,
                width: boardBounds.width,
                height: boardBounds.height,
              }}
            >
              <svg
                className="pointer-events-auto absolute inset-0 overflow-visible"
                viewBox={`0 0 ${boardBounds.width} ${boardBounds.height}`}
              >
                {connections.map(conn => {
                  const line = getConnectionLine(conn);
                  const isSelected = conn.id === selectedConnectionId;

                  if (!line) {
                    return null;
                  }

                  const fromX = line.from.x - boardOrigin.x;
                  const fromY = line.from.y - boardOrigin.y;
                  const toX = line.to.x - boardOrigin.x;
                  const toY = line.to.y - boardOrigin.y;

                  return (
                    <g key={conn.id}>
                      <line
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeWidth="18"
                        x1={fromX}
                        y1={fromY}
                        x2={toX}
                        y2={toY}
                        style={{ pointerEvents: isLinkMode ? 'none' : 'stroke' }}
                        onPointerDown={(event) => handleConnectionPointerDown(conn.id, event)}
                      />
                      <line
                        className="yarn-line pointer-events-none"
                        stroke={isSelected ? '#ffd1d1' : '#ff2e2e'}
                        strokeLinecap="round"
                        strokeWidth={isSelected ? '4.5' : '3'}
                        x1={fromX}
                        y1={fromY}
                        x2={toX}
                        y2={toY}
                        opacity={isSelected ? 1 : 0.92}
                      />
                      <circle
                        className="yarn-endpoint pointer-events-none"
                        cx={fromX}
                        cy={fromY}
                        r={isSelected ? '5.5' : '4.5'}
                        fill={isSelected ? '#fff1f2' : '#ffd4d4'}
                        stroke={isSelected ? '#ffe4e6' : '#ff7a7a'}
                        strokeWidth="1.4"
                      />
                      <circle
                        className="yarn-endpoint pointer-events-none"
                        cx={toX}
                        cy={toY}
                        r={isSelected ? '5.5' : '4.5'}
                        fill={isSelected ? '#fff1f2' : '#ffd4d4'}
                        stroke={isSelected ? '#ffe4e6' : '#ff7a7a'}
                        strokeWidth="1.4"
                      />
                    </g>
                  );
                })}
              </svg>

              {selectedConnectionMidpoint && !isLinkMode && (
                <button
                  type="button"
                  aria-label="Delete selected link"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => removeConnection(selectedConnectionId!)}
                  className="pointer-events-auto absolute z-40 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:scale-105 hover:bg-red-600"
                  style={{
                    left: selectedConnectionMidpoint.x - boardOrigin.x,
                    top: selectedConnectionMidpoint.y - boardOrigin.y,
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Evidence Items */}
            {items.map(item => {
              const isSelectedSource = linkSourceId === item.id;
              const isLinkCandidate = isLinkMode && !isSelectedSource;

              return (
                <motion.div
                  key={item.id}
                  ref={(node) => {
                    evidenceRefs.current[item.id] = node;
                  }}
                  onPointerDown={(event) => handleItemPointerDown(item.id, event)}
                  style={{ 
                    position: 'absolute',
                    top: item.position.y,
                    left: item.position.x,
                    zIndex: isSelectedSource ? 30 : 20,
                    rotate: item.rotation,
                    touchAction: 'none',
                  }}
                  className={`group relative ${
                    isLinkMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeEvidence(item.id)}
                    className="absolute -top-3 -right-3 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/80 opacity-90 shadow-lg transition-all hover:scale-105 hover:bg-red-600 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {/* Push Pin */}
                  <div 
                    className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 pushpin-shadow pointer-events-none"
                    style={{ color: item.pinColor }}
                  >
                    <Pin className="w-8 h-8 fill-current" />
                  </div>

                  {/* Content based on type */}
                  {item.type === 'photo' && (
                    <div
                      className={`w-64 rounded-sm border p-2 shadow-2xl transition-transform ${
                        isSelectedSource
                          ? 'border-evidence-red shadow-[0_0_30px_rgba(255,46,46,0.45)]'
                          : 'border-white/20'
                      } ${
                        isLinkCandidate ? 'hover:scale-[1.03] hover:shadow-[0_0_18px_rgba(255,255,255,0.18)]' : 'hover:scale-105'
                      } bg-[#f8f5f0]`}
                    >
                      <div className="aspect-square bg-black rounded-sm mb-2 overflow-hidden relative">
                        <img 
                          className="w-full h-full object-cover grayscale brightness-90 contrast-125" 
                          src={item.imageUrl} 
                          alt={item.title}
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute bottom-2 left-2 bg-red-600 px-1 py-0.5 rounded text-[8px] text-white font-bold uppercase tracking-tighter">Classified</div>
                      </div>
                      <div className="px-1 pb-1">
                        <p className="text-[9px] font-mono text-slate-500 uppercase">{item.fileNumber}</p>
                        <p className="text-xs font-bold text-slate-900">{item.title}</p>
                      </div>
                    </div>
                  )}

                  {item.type === 'note' && (
                    <div
                      className={`w-48 aspect-square shadow-xl p-4 flex flex-col transition-transform ${
                        isSelectedSource
                          ? 'ring-4 ring-evidence-red/80 shadow-[0_0_26px_rgba(255,46,46,0.35)]'
                          : ''
                      } ${
                        isLinkCandidate ? 'hover:scale-[1.04] hover:shadow-[0_0_18px_rgba(255,255,255,0.15)]' : 'hover:scale-110'
                      } bg-yellow-200`}
                    >
                      <p className="text-slate-800 font-mono text-sm leading-tight italic border-b border-black/5 pb-2 mb-2">
                        {item.content}
                      </p>
                      <p className="text-slate-600 font-mono text-[10px] mt-auto">Source: V. Moore</p>
                    </div>
                  )}

                  {item.type === 'report' && (
                    <div
                      className={`w-80 p-6 rounded shadow-2xl transition-transform ${
                        isSelectedSource
                          ? 'ring-4 ring-evidence-red/80 shadow-[0_0_30px_rgba(255,46,46,0.35)]'
                          : ''
                      } ${
                        isLinkCandidate ? 'hover:scale-[1.02] hover:shadow-[0_0_18px_rgba(255,255,255,0.18)]' : 'hover:scale-105'
                      } bg-white`}
                    >
                      <div className="border-b-2 border-slate-900 pb-2 mb-4">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Forensic Lab Report</h4>
                        <p className="text-[8px] text-slate-500 font-bold">{item.fileNumber}</p>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full"></div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full"></div>
                        <div className="h-1.5 w-3/4 bg-slate-200 rounded-full"></div>
                      </div>
                      <div className="text-xs font-mono text-slate-900 leading-relaxed bg-slate-50 p-3 border border-slate-100 italic">
                        {item.content?.split('Unidentified Residue').map((part, i, arr) => (
                          <React.Fragment key={i}>
                            {part}
                            {i < arr.length - 1 && <span className="bg-black text-white px-1 mx-1">Unidentified Residue</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>

          {isLinkMode && (
            <div className="absolute top-6 left-6 z-50 rounded-xl border border-evidence-red/30 bg-black/65 px-4 py-3 text-xs font-medium text-white shadow-2xl backdrop-blur-md pointer-events-none">
              {linkSourceId
                ? 'Select a second item to create the link. Click the same item again to clear selection.'
                : 'Link mode active. Select the first item, or press Escape/click the board to cancel.'}
            </div>
          )}

          {/* Zoom Controls */}
          <div className="absolute bottom-8 right-8 flex flex-col gap-4 z-50">
            <div className="flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl">
              <button 
                onClick={() => setZoomLevel(zoom + 0.1)}
                className="p-3 hover:bg-white/10 text-white/70 transition-colors border-b border-white/5"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setZoomLevel(zoom - 0.1)}
                className="p-3 hover:bg-white/10 text-white/70 transition-colors"
              >
                <Minus className="w-5 h-5" />
              </button>
            </div>
            <button className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-xl border border-white/20 p-3.5 rounded-full shadow-2xl transition-all active:scale-95">
              <Maximize className="w-5 h-5" />
            </button>
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-mono text-slate-400 text-center tracking-widest">
              {(zoom * 100).toFixed(1)}%
            </div>
          </div>

          {/* MiniMap */}
          <div className="absolute bottom-8 left-8 w-44 h-28 bg-black/30 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 p-1.5 pointer-events-none">
            <div className={`w-full h-full relative rounded-lg border border-white/5 board-theme-${backgroundTheme}`}>
              {minimapItems.map(item => (
                <div
                  key={item.id}
                  className={`absolute rounded-[2px] border ${item.className}`}
                  style={{
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    height: item.height,
                  }}
                />
              ))}
              <div
                className="absolute border-2 border-evidence-red/50 bg-white/5 shadow-[0_0_12px_rgba(255,46,46,0.2)]"
                style={minimapViewportStyle}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
