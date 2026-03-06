import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  FolderHeart, 
  Search, 
  Settings, 
  FileText, 
  Camera, 
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

export default function App() {
  const [items, setItems] = useState<EvidenceItem[]>(INITIAL_ITEMS);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [zoom, setZoom] = useState(0.625);
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evidenceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const itemsRef = useRef(items);
  const idCounterRef = useRef(INITIAL_ITEMS.length + 1);
  const connectionCounterRef = useRef(INITIAL_CONNECTIONS.length + 1);
  const activeDragRef = useRef<{ id: string; pointerStart: Position; itemStart: Position } | null>(null);
  const zoomRef = useRef(zoom);
  const dragHandlersRef = useRef<{ onMove: (event: PointerEvent) => void; onUp: () => void } | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const removeDragListeners = useCallback(() => {
    const handlers = dragHandlersRef.current;
    if (!handlers) return;

    window.removeEventListener('pointermove', handlers.onMove);
    window.removeEventListener('pointerup', handlers.onUp);
    window.removeEventListener('pointercancel', handlers.onUp);
    dragHandlersRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      activeDragRef.current = null;
      removeDragListeners();
      itemsRef.current.forEach(item => {
        if (item.imageSource === 'upload' && item.imageUrl) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
    };
  }, [removeDragListeners]);

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

    activeDragRef.current = {
      id,
      pointerStart: { x: event.clientX, y: event.clientY },
      itemStart: { ...item.position },
    };

    removeDragListeners();

    const onMove = (moveEvent: PointerEvent) => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) return;

      const zoomScale = zoomRef.current || 1;
      const nextPosition = {
        x: activeDrag.itemStart.x + (moveEvent.clientX - activeDrag.pointerStart.x) / zoomScale,
        y: activeDrag.itemStart.y + (moveEvent.clientY - activeDrag.pointerStart.y) / zoomScale,
      };

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
      removeDragListeners();
    };

    dragHandlersRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleLinkModeToggle = () => {
    activeDragRef.current = null;
    removeDragListeners();
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
  };

  const handleConnectionPointerDown = (id: string, event: React.PointerEvent<SVGLineElement>) => {
    if (event.button !== 0 || isLinkMode) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedConnectionId(id);
  };

  const getObjectCenter = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return { x: 0, y: 0 };

    const node = evidenceRefs.current[id];
    if (node) {
      return {
        x: item.position.x + node.offsetWidth / 2,
        y: item.position.y,
      };
    }

    // Fallback for first paint before refs exist.
    let width = 256;
    if (item.type === 'note') {
      width = 192;
    }
    if (item.type === 'report') {
      width = 320;
    }

    return {
      x: item.position.x + width / 2,
      y: item.position.y,
    };
  };

  const getDefaultPosition = (): Position => {
    const canvasWidth = canvasRef.current?.clientWidth ?? 1000;
    const canvasHeight = canvasRef.current?.clientHeight ?? 700;
    const jitter = 80;

    return {
      x: Math.max(24, canvasWidth / (2 * zoom) - 140 + (Math.random() * jitter - jitter / 2)),
      y: Math.max(40, canvasHeight / (2 * zoom) - 120 + (Math.random() * jitter - jitter / 2)),
    };
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
    setConnections(prev => prev.filter(conn => conn.fromId !== id && conn.toId !== id));
    setSelectedConnectionId(prev => {
      if (!prev) return prev;

      const selectedConnection = connections.find(connection => connection.id === prev);
      if (!selectedConnection) return null;

      return selectedConnection.fromId === id || selectedConnection.toId === id ? null : prev;
    });
    setLinkSourceId(prev => prev === id ? null : prev);
  };

  const selectedConnection = selectedConnectionId
    ? connections.find(connection => connection.id === selectedConnectionId) ?? null
    : null;
  const selectedConnectionMidpoint = selectedConnection
    ? (() => {
        const from = getObjectCenter(selectedConnection.fromId);
        const to = getObjectCenter(selectedConnection.toId);

        return {
          x: (from.x + to.x) / 2,
          y: (from.y + to.y) / 2,
        };
      })()
    : null;

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
          className="flex-1 relative wood-texture canvas-grain overflow-hidden cursor-grab active:cursor-grabbing"
          ref={canvasRef}
        >
          <motion.div 
            className="absolute inset-0 w-full h-full"
            style={{ scale: zoom, originX: 0.5, originY: 0.5 }}
            onPointerDown={handleCanvasPointerDown}
          >
            {/* Yarn Connections */}
            <svg className="absolute inset-0 z-10 h-full w-full">
              {connections.map(conn => {
                const from = getObjectCenter(conn.fromId);
                const to = getObjectCenter(conn.toId);
                const isSelected = conn.id === selectedConnectionId;

                return (
                  <g key={conn.id}>
                    <line
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeWidth="18"
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      style={{ pointerEvents: isLinkMode ? 'none' : 'stroke' }}
                      onPointerDown={(event) => handleConnectionPointerDown(conn.id, event)}
                    />
                    <line
                      className="yarn-line pointer-events-none"
                      stroke={isSelected ? '#ffd1d1' : '#ff2e2e'}
                      strokeLinecap="round"
                      strokeWidth={isSelected ? '4.5' : '3'}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      opacity={isSelected ? 1 : 0.92}
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
                className="absolute z-40 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:scale-105 hover:bg-red-600"
                style={{
                  left: selectedConnectionMidpoint.x,
                  top: selectedConnectionMidpoint.y,
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

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
                    top: 0,
                    left: 0,
                    zIndex: isSelectedSource ? 30 : 20,
                    x: item.position.x,
                    y: item.position.y,
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
                onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))}
                className="p-3 hover:bg-white/10 text-white/70 transition-colors border-b border-white/5"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.2))}
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
            <div className="w-full h-full bg-black/40 relative rounded-lg border border-white/5">
              {/* Simplified representations of items */}
              <div className="absolute top-4 left-4 w-5 h-5 border border-white/20 bg-white/5"></div>
              <div className="absolute top-12 left-20 w-3 h-3 border border-white/20 bg-white/5"></div>
              <div className="absolute top-16 left-10 w-8 h-4 border border-white/20 bg-white/5"></div>
              {/* Viewport indicator */}
              <div className="absolute top-3 left-3 w-28 h-20 border-2 border-evidence-red/40 bg-white/5"></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
