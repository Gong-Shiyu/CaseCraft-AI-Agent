
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MindMapNode, AppSelection, Library } from '../types';
import { expandBrainstormNode, analyzeStartImage } from '../services/geminiService';
import { Loader2, Sparkles, Image as ImageIcon, LayoutGrid, X, AlertCircle, MousePointerClick, RefreshCcw, Search, ZoomIn, ZoomOut, Maximize, Plus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

// --- Types for Physics Engine ---

interface PhysicsNode extends MindMapNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isDragging?: boolean;
}

interface PhysicsLink {
  source: string; // Node ID
  target: string; // Node ID
  strength: number;
}

interface BrainstormCanvasProps {
  nodes: MindMapNode[];
  setNodes: React.Dispatch<React.SetStateAction<MindMapNode[]>>;
  selection: AppSelection;
  library: Library;
  onNavigateToStudio?: () => void;
}

// --- Constants ---
const COLORS = {
  root: '#4f46e5', // Indigo 600
  up: '#60a5fa',   // Blue 400
  side: '#a78bfa', // Violet 400
  down: '#94a3b8', // Slate 400
  image: '#f43f5e', // Rose 500
  text: '#ffffff', // White text
  bg: '#0f172a'    // Slate 900
};

const BASE_RADIUS = {
  root: 45,
  level1: 35,
  normal: 28,
  image: 40
};

// Physics Tuning - WIDE & STABLE
const PHYSICS = {
    FRICTION: 0.50,          // Keep high friction to prevent jitter
    REPULSION: 1000,         // Increased Repulsion (was 500) to push nodes apart
    LINK_STRENGTH: 0.008,    // Lower strength (was 0.015) to allow nodes to float further apart
    LINK_DISTANCE: 260,      // Increased Distance (was 160) for better separation
    CENTER_GRAVITY: 0.0001,  // Very weak pull
    STOP_THRESHOLD: 2.0      // High threshold
};

const BrainstormCanvas: React.FC<BrainstormCanvasProps> = ({ nodes, setNodes, selection, library, onNavigateToStudio }) => {
  // UI State (Overlays only)
  const [rootInput, setRootInput] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [infoNode, setInfoNode] = useState<MindMapNode | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'warning' | 'error'} | null>(null);
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  
  // Force re-render for UI overlays when physics state changes significantly
  const [, setTick] = useState(0);

  // Physics & Canvas Refs (Mutable, High Performance)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<PhysicsNode[]>([]);
  const linksRef = useRef<PhysicsLink[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 }); // Viewport: Pan x/y, Zoom k
  const requestRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const simulationActiveRef = useRef(true);
  
  // Interaction Refs
  const isDragging = useRef<boolean>(false);
  const dragNode = useRef<PhysicsNode | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const startDragPos = useRef({ x: 0, y: 0 }); // To distinguish click vs drag
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Sync global nodes to physics nodes (Restoration)
  useEffect(() => {
    if (nodes.length > 0 && nodesRef.current.length === 0 && !initializedRef.current) {
        // Restore from props
        nodesRef.current = nodes.map(n => {
            // Recalculate radius based on restored text
            let r = n.level === 0 ? BASE_RADIUS.root : (n.type === 'image' ? BASE_RADIUS.image : BASE_RADIUS.normal);
            // Simple adaptive radius estimate for restore
            if (n.text && n.text.length > 6) {
                r += Math.min(n.text.length * 1.5, 40);
            }

            return {
                ...n,
                x: (Math.random() - 0.5) * 100, 
                y: (Math.random() - 0.5) * 100,
                vx: 0,
                vy: 0,
                radius: r,
                color: n.level === 0 ? COLORS.root : (n.associationType === 'up' ? COLORS.up : (n.associationType === 'side' ? COLORS.side : COLORS.down))
            }
        });
        
        // Rebuild links (Parent -> Child)
        const newLinks: PhysicsLink[] = [];
        nodesRef.current.forEach(n => {
            if (n.parentId) {
                // Verify parent exists
                if (nodesRef.current.some(p => p.id === n.parentId)) {
                    newLinks.push({ source: n.parentId, target: n.id, strength: 1 });
                }
            }
        });
        linksRef.current = newLinks;
        initializedRef.current = true;
        simulationActiveRef.current = true; // Restart sim on load
    }
  }, [nodes]);

  // Toast Timer
  useEffect(() => {
    if (toast) {
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Helper: Create Physics Node ---
  const createPhysicsNode = (node: MindMapNode, x: number, y: number): PhysicsNode => {
      let r = BASE_RADIUS.normal;
      let color = COLORS.down;

      if (node.level === 0) { r = BASE_RADIUS.root; color = COLORS.root; }
      else if (node.type === 'image') { r = BASE_RADIUS.image; color = COLORS.image; }
      else if (node.associationType === 'up') color = COLORS.up;
      else if (node.associationType === 'side') color = COLORS.side;
      
      // ADAPTIVE RADIUS LOGIC
      // If text is long (e.g. English slogan), increase radius
      // Base assumption: ~6 chars fit in normal radius
      const textLen = node.text.length;
      if (textLen > 6) {
          // Growth factor
          const growth = Math.sqrt(textLen) * 6; 
          r = Math.min(r + growth, 90); // Cap at 90px
      }

      return {
          ...node,
          x,
          y,
          vx: 0,
          vy: 0,
          radius: r,
          color
      };
  };

  // --- Helper: Wrapped Text Renderer ---
  const drawWrappedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' ');
      let lines = [];
      let currentLine = words[0];

      // If it's a single long word (or Chinese string without spaces), we might need character splitting
      if (words.length === 1 && text.length > 5) {
          // Check if it fits
          if (ctx.measureText(text).width > maxWidth) {
              // Brute force split for CJK or long strings
              let tempLine = '';
              for (let i = 0; i < text.length; i++) {
                  if (ctx.measureText(tempLine + text[i]).width < maxWidth) {
                      tempLine += text[i];
                  } else {
                      lines.push(tempLine);
                      tempLine = text[i];
                  }
              }
              lines.push(tempLine);
          } else {
              lines.push(text);
          }
      } else {
          // Standard word wrap for sentences
          for (let i = 1; i < words.length; i++) {
              const word = words[i];
              const width = ctx.measureText(currentLine + " " + word).width;
              if (width < maxWidth) {
                  currentLine += " " + word;
              } else {
                  lines.push(currentLine);
                  currentLine = word;
              }
          }
          lines.push(currentLine);
      }
      
      // Draw Lines centered vertically
      const totalHeight = lines.length * lineHeight;
      let startY = y - (totalHeight / 2) + (lineHeight / 2); // Shift up by half height, then down to baseline of first line approximately
      
      // Fine tune baseline centering
      startY += lineHeight * 0.1;

      lines.forEach((line, i) => {
          ctx.fillText(line, x, startY + (i * lineHeight));
      });
  };

  // --- Main Loop: Physics + Render ---
  const loop = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Physics Update (Only if active)
      if (simulationActiveRef.current || isDragging.current) {
          const pNodes = nodesRef.current;
          const links = linksRef.current;
          let totalEnergy = 0;

          // Repulsion
          for (let i = 0; i < pNodes.length; i++) {
              for (let j = i + 1; j < pNodes.length; j++) {
                  const a = pNodes[i];
                  const b = pNodes[j];
                  const dx = b.x - a.x;
                  const dy = b.y - a.y;
                  let distSq = dx * dx + dy * dy || 0.1;
                  const dist = Math.sqrt(distSq);
                  
                  // Dynamic repulsion radius based on actual node sizes
                  const minDist = a.radius + b.radius + 30; 

                  if (dist < minDist * 2.5) { 
                      const force = (PHYSICS.REPULSION * 50) / (distSq + 100); 
                      const fx = (dx / dist) * force;
                      const fy = (dy / dist) * force;

                      if (!a.isDragging) { a.vx -= fx; a.vy -= fy; }
                      if (!b.isDragging) { b.vx += fx; b.vy += fy; }
                  }
              }
          }

          // Spring Links
          links.forEach(link => {
              const source = pNodes.find(n => n.id === link.source);
              const target = pNodes.find(n => n.id === link.target);
              if (source && target) {
                  const dx = target.x - source.x;
                  const dy = target.y - source.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  
                  // Adaptive link distance based on radii
                  const targetDist = PHYSICS.LINK_DISTANCE + (source.radius + target.radius) * 0.5;

                  const force = (dist - targetDist) * PHYSICS.LINK_STRENGTH; 
                  const fx = (dx / dist) * force;
                  const fy = (dy / dist) * force;

                  if (!source.isDragging) { source.vx += fx; source.vy += fy; }
                  if (!target.isDragging) { target.vx -= fx; target.vy -= fy; }
              }
          });

          // Gravity / Friction
          pNodes.forEach(n => {
              if (!n.isDragging) {
                  n.vx += (0 - n.x) * PHYSICS.CENTER_GRAVITY; 
                  n.vy += (0 - n.y) * PHYSICS.CENTER_GRAVITY;
                  n.vx *= PHYSICS.FRICTION;
                  n.vy *= PHYSICS.FRICTION;

                  // CRITICAL: Aggressive Velocity Clamping to stop jitter
                  // If velocity is small, force to zero immediately
                  if (Math.abs(n.vx) < 0.2) n.vx = 0;
                  if (Math.abs(n.vy) < 0.2) n.vy = 0;

                  n.x += n.vx;
                  n.y += n.vy;
                  totalEnergy += Math.abs(n.vx) + Math.abs(n.vy);
              }
          });

          // Sleep check
          if (totalEnergy < PHYSICS.STOP_THRESHOLD && !isDragging.current && !pNodes.some(n => n.isLoading)) {
              simulationActiveRef.current = false;
          }
      }

      // 2. Render
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
      }
      
      // Clear
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      
      const transform = transformRef.current;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.translate(cx + transform.x, cy + transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw Links
      ctx.lineWidth = 2;
      linksRef.current.forEach(link => {
          const source = nodesRef.current.find(n => n.id === link.source);
          const target = nodesRef.current.find(n => n.id === link.target);
          if (source && target) {
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
              ctx.beginPath();
              ctx.moveTo(source.x, source.y);
              ctx.lineTo(target.x, target.y);
              ctx.stroke();
          }
      });

      // Draw Nodes
      nodesRef.current.forEach(node => {
          // Shadow
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;

          // Shape
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = node.type === 'image' && node.imageUrl ? '#fff' : node.color;
          ctx.fill();
          
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          // Selection Border
          if (node.isMarked) {
              ctx.lineWidth = 4;
              ctx.strokeStyle = '#fbbf24'; // Amber 400
              ctx.stroke();
          } else {
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = 'rgba(255,255,255,0.15)';
              ctx.stroke();
          }

          // Content
          if (node.type === 'image' && node.imageUrl) {
              ctx.fillStyle = COLORS.image;
              ctx.font = `bold 14px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText("IMG", node.x, node.y);
          } else {
              ctx.fillStyle = '#fff';
              // Adaptive font size based on radius, but clamped
              const fontSize = Math.max(10, Math.min(16, node.radius / 2.5));
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle'; // For simple vertical alignment ref
              
              // NEW: Multiline Text Rendering
              // Width available is roughly diameter minus padding
              const maxWidth = node.radius * 1.8; 
              drawWrappedText(ctx, node.text, node.x, node.y, maxWidth, fontSize * 1.2);
          }

          // Loading Spinner Ring
          if (node.isLoading) {
              const time = Date.now() / 200;
              ctx.beginPath();
              ctx.arc(node.x, node.y, node.radius + 6, time, time + 2);
              ctx.strokeStyle = '#6366f1';
              ctx.lineWidth = 3;
              ctx.stroke();
          }
      });

      ctx.restore();
      
      requestRef.current = requestAnimationFrame(loop);
  }, []); 

  // Start/Stop Loop
  useEffect(() => {
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);


  // --- Input Handlers ---

  const getWorldPos = (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left - canvas.width / 2;
      const rawY = e.clientY - rect.top - canvas.height / 2;
      const t = transformRef.current;
      return {
          x: (rawX - t.x) / t.k,
          y: (rawY - t.y) / t.k
      };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      const pos = getWorldPos(e);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      startDragPos.current = { x: e.clientX, y: e.clientY }; 

      // Hit Test (Reverse iteration for z-index)
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
          const node = nodes[i];
          const dist = Math.sqrt((pos.x - node.x) ** 2 + (pos.y - node.y) ** 2);
          if (dist <= node.radius) {
              isDragging.current = true;
              dragNode.current = node;
              node.isDragging = true;
              simulationActiveRef.current = true; // Wake up physics
              return;
          }
      }

      // Background Drag
      isDragging.current = true;
      dragNode.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      // 1. Hover Cursor Logic (When NOT dragging)
      if (!isDragging.current) {
          const pos = getWorldPos(e);
          const nodes = nodesRef.current;
          let isHover = false;
          
          for (let i = nodes.length - 1; i >= 0; i--) {
             const node = nodes[i];
             const dist = Math.sqrt((pos.x - node.x) ** 2 + (pos.y - node.y) ** 2);
             if (dist <= node.radius) {
                 isHover = true;
                 break;
             }
          }
          if (canvasRef.current) {
              canvasRef.current.style.cursor = isHover ? 'pointer' : 'grab';
          }
          return; // Stop here if just moving mouse
      }
      
      // 2. Drag Logic
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (dragNode.current) {
          // Drag Node (Coordinate conversion needed because mouse delta is screen space)
          const t = transformRef.current;
          dragNode.current.x += dx / t.k;
          dragNode.current.y += dy / t.k;
          dragNode.current.vx = 0;
          dragNode.current.vy = 0;
          simulationActiveRef.current = true; // Keep awake
      } else {
          // Pan Canvas
          transformRef.current.x += dx;
          transformRef.current.y += dy;
      }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
      isDragging.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';

      const node = dragNode.current;
      
      if (node) {
          node.isDragging = false;
          dragNode.current = null;

          // Click Detection: moved very little?
          const moveDist = Math.sqrt(
              (e.clientX - startDragPos.current.x) ** 2 + 
              (e.clientY - startDragPos.current.y) ** 2
          );

          if (moveDist < 5) {
              // It's a click!
              if (e.shiftKey) {
                  // Toggle Mark
                  node.isMarked = !node.isMarked;
                  syncNodesToGlobal(); 
                  setTick(t => t + 1); 
              } else if (node.type === 'image') {
                  setInfoNode(node);
              } else {
                  // Expand
                  await expandNode(node);
              }
          }
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const t = transformRef.current;
      const newScale = Math.max(0.1, Math.min(5, t.k + delta));
      t.k = newScale;
  };

  // --- Actions ---

  const syncNodesToGlobal = () => {
      setNodes([...nodesRef.current]);
  };

  const startRoot = async (text: string) => {
      if (!text.trim()) return;
      setIsInitializing(true);
      
      // Reset
      nodesRef.current = [];
      linksRef.current = [];
      transformRef.current = { x: 0, y: 0, k: 1 };
      simulationActiveRef.current = true;

      const rootNodeData: MindMapNode = {
          id: `root-${Date.now()}`,
          text: text,
          type: 'text',
          level: 0,
          children: [],
          isSelected: true,
          isLoading: false, 
          associationType: 'root'
      };

      // Spawn at center
      const rootPNode = createPhysicsNode(rootNodeData, 0, 0);
      nodesRef.current = [rootPNode];
      
      try {
          await expandNode(rootPNode);
      } catch (e: any) {
          rootPNode.isLoading = false;
          setToast({ message: "初始化失败", type: 'error' });
      } finally {
          setIsInitializing(false);
          syncNodesToGlobal();
      }
  };

  const expandNode = async (node: PhysicsNode) => {
      // Always look up the latest node from ref
      const currentNode = nodesRef.current.find(n => n.id === node.id);
      if (!currentNode) return;
      
      const hasChildren = linksRef.current.some(l => l.source === currentNode.id);
      if (currentNode.isLoading || hasChildren) return;

      currentNode.isLoading = true;
      simulationActiveRef.current = true; // Wake physics
      setTick(t => t + 1); 

      try {
          const result = await expandBrainstormNode(currentNode, [currentNode.text], library.prompts);
          
          const newNodesData: MindMapNode[] = [];
          
          const processGroup = (texts: string[], type: 'up'|'side'|'down') => {
              texts.forEach((text, idx) => {
                  newNodesData.push({
                      id: `${currentNode.id}-${type}-${idx}-${Date.now()}`,
                      text,
                      type: 'text',
                      level: currentNode.level + 1,
                      children: [],
                      parentId: currentNode.id,
                      associationType: type
                  });
              });
          };

          processGroup(result.up || [], 'up');
          processGroup(result.side || [], 'side');
          processGroup(result.down || [], 'down');

          if (newNodesData.length === 0) {
              setToast({ message: "没有联想出新词汇", type: 'warning' });
          }

          // Add to Physics World with Better Initial Positions
          const newPNodes = newNodesData.map((n, i) => {
              // Distribute in a circle/fan around parent to minimize initial overlapping energy
              const angle = (i / newNodesData.length) * Math.PI * 2 + (Math.random() * 0.5);
              const spawnDist = PHYSICS.LINK_DISTANCE * 0.8; // Start close to final link distance
              const x = currentNode.x + Math.cos(angle) * spawnDist;
              const y = currentNode.y + Math.sin(angle) * spawnDist;
              
              return createPhysicsNode(n, x, y);
          });
          
          const newLinks = newPNodes.map(n => ({ source: currentNode.id, target: n.id, strength: 1 }));

          nodesRef.current = [...nodesRef.current, ...newPNodes];
          linksRef.current = [...linksRef.current, ...newLinks];
          
          currentNode.children = newNodesData.map(n => n.id);
          
      } catch (e: any) {
          setToast({ message: `扩展失败: ${e.message}`, type: 'error' });
      } finally {
          currentNode.isLoading = false;
          syncNodesToGlobal();
      }
  };

  const handleGoToStudio = () => {
      syncNodesToGlobal(); 
      if (onNavigateToStudio) {
          onNavigateToStudio();
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            const analysis = await analyzeStartImage(base64, library.prompts);
            setRootInput(analysis);
            startRoot(analysis);
          } catch (e: any) {
             setToast({ message: `分析失败: ${e.message}`, type: 'error' });
          }
      };
      reader.readAsDataURL(file);
  };

  return (
    <div className="flex-1 bg-slate-900 relative overflow-hidden flex flex-col h-full text-white">
        
       {/* Toolbar Overlay */}
       <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4 pointer-events-none">
            <div className="flex gap-2 pointer-events-auto bg-slate-800/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl">
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-indigo-400 transition-colors"
                    title="上传参考图"
                >
                    <ImageIcon className="w-5 h-5" />
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </button>
                <div className="flex-1 relative group">
                    <input 
                        value={rootInput}
                        onChange={(e) => setRootInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && startRoot(rootInput)}
                        placeholder="输入核心概念 (如: 赛博朋克兔子)..."
                        className="w-full h-full px-12 rounded-xl bg-black/20 border border-transparent focus:border-indigo-500/50 focus:bg-black/40 text-white placeholder-slate-500 outline-none transition-all font-medium text-sm"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <button 
                    onClick={() => startRoot(rootInput)}
                    disabled={isInitializing}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isInitializing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}
                    开始
                </button>
            </div>
       </div>

       {/* View Controls */}
       <div className="absolute top-6 right-6 z-20 flex flex-col gap-2 pointer-events-auto">
            <div className="bg-slate-800/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10 flex flex-col gap-1">
                <button onClick={() => transformRef.current.k *= 1.2} className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"><ZoomIn className="w-5 h-5"/></button>
                <button onClick={() => transformRef.current.k *= 0.8} className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"><ZoomOut className="w-5 h-5"/></button>
                <button onClick={() => transformRef.current = {x:0, y:0, k:1}} className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"><Maximize className="w-5 h-5"/></button>
            </div>
            
            {nodesRef.current.some(n => n.isMarked) && (
                <button 
                    onClick={handleGoToStudio}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-500/30 font-bold flex items-center justify-center gap-2 hover:scale-105 transition-transform animate-in fade-in slide-in-from-right-4"
                >
                    <LayoutGrid className="w-5 h-5" />
                    <span className="text-sm">去制作 ({nodesRef.current.filter(n => n.isMarked).length})</span>
                </button>
            )}
       </div>

       {/* Toast */}
       {toast && (
           <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in zoom-in duration-300 pointer-events-none">
               <div className={`px-4 py-2 rounded-full shadow-xl border flex items-center gap-2 backdrop-blur-md ${
                   toast.type === 'error' ? 'bg-red-500/90 text-white border-red-400' : 'bg-amber-500/90 text-white border-amber-400'
               }`}>
                   <AlertCircle className="w-4 h-4" />
                   <span className="text-sm font-bold">{toast.message}</span>
               </div>
           </div>
       )}

       {/* Collapsible Legend */}
       <div className="absolute bottom-6 left-6 z-20 pointer-events-none select-none">
            <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl border border-white/10 text-xs font-medium text-slate-300 shadow-xl overflow-hidden pointer-events-auto transition-all duration-300 flex flex-col">
                <button 
                    onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                    className="flex items-center gap-2 px-4 py-3 hover:bg-white/5 transition-colors w-full"
                >
                    <HelpCircle className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-white">图例 & 操作</span>
                    {isLegendExpanded ? <ChevronDown className="w-3 h-3 ml-auto"/> : <ChevronUp className="w-3 h-3 ml-auto"/>}
                </button>

                {isLegendExpanded && (
                    <div className="px-4 pb-4 space-y-2.5 animate-in slide-in-from-bottom-2 fade-in">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.6)]" style={{background: COLORS.root}}></div> 核心 (Root)</div>
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background: COLORS.up}}></div> 上级 (Up)</div>
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background: COLORS.side}}></div> 同级 (Side)</div>
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background: COLORS.down}}></div> 下级 (Down)</div>
                        <div className="pt-2 mt-2 border-t border-white/10 text-[10px] text-slate-500 leading-relaxed">
                            <div className="flex items-center gap-1.5"><MousePointerClick className="w-3 h-3"/> 点击展开联想</div>
                            <div className="flex items-center gap-1.5"><span className="font-bold border border-slate-600 rounded px-1 text-[9px]">Shift</span> + 点击标记生成</div>
                            <div className="flex items-center gap-1.5"><RefreshCcw className="w-3 h-3"/> 滚轮缩放 / 拖拽移动</div>
                        </div>
                    </div>
                )}
            </div>
       </div>

        {/* Canvas Layer */}
        <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none block"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        />

        {/* Empty State Hint */}
        {nodesRef.current.length === 0 && !isInitializing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-500/30">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-6 animate-pulse">
                    <Plus className="w-12 h-12" />
                </div>
                <p className="text-xl font-light tracking-widest uppercase">Elastic Mind Map</p>
            </div>
        )}

       {/* Image Info Modal */}
       {infoNode && (
           <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setInfoNode(null)}>
               <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                   <div className="relative aspect-[9/16] bg-black flex-shrink-0">
                       <img src={infoNode.imageUrl} className="w-full h-full object-contain" alt="Preview" />
                       <button onClick={() => setInfoNode(null)} className="absolute top-4 right-4 bg-black/50 hover:bg-white/20 p-2 rounded-full text-white transition-colors"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-5 flex-1 flex flex-col overflow-hidden">
                       <h3 className="font-bold text-white text-lg flex-shrink-0">Design Preview</h3>
                       <div className="mt-3 bg-white/5 p-3 rounded-lg border border-white/5 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
                           <p className="text-xs text-slate-400 font-mono leading-relaxed break-all">
                               {infoNode.generationMetadata?.prompt}
                           </p>
                       </div>
                       <button 
                           onClick={() => onNavigateToStudio && onNavigateToStudio()}
                           className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-500/20 flex-shrink-0"
                       >
                           前往工坊编辑
                       </button>
                   </div>
               </div>
           </div>
       )}

    </div>
  );
};

export default BrainstormCanvas;
