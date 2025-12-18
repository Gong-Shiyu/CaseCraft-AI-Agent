
import React, { useState, useEffect, useMemo } from 'react';
import { AppSelection, Library, GeneratedDesign, MindMapNode } from '../types';
import { generatePhoneCaseDesign, generateDesignVariants } from '../services/geminiService';
import { Wand2, Download, Loader2, Maximize2, Info, FileText, ImageIcon, X, Layers, Settings2, Plus, Minus, Coins, Calculator, Gem, Check, Split, Sparkles, ArrowLeft, ArrowRight, Grid, Save } from 'lucide-react';

interface DesignGeneratorProps {
  selectedNodes: MindMapNode[]; // These are the "Marked" nodes
  selection: AppSelection; // Global selection
  setSelection: React.Dispatch<React.SetStateAction<AppSelection>>; // To allow editing config here
  library: Library;
  onRemoveNode?: (id: string) => void;
}

const DesignGenerator: React.FC<DesignGeneratorProps> = ({ selectedNodes, selection, setSelection, library, onRemoveNode }) => {
  const [generatedDesigns, setGeneratedDesigns] = useState<GeneratedDesign[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePreview, setActivePreview] = useState<GeneratedDesign | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // --- Variant Generation State ---
  const [isVariantPanelOpen, setIsVariantPanelOpen] = useState(false);
  const [variantCount, setVariantCount] = useState(2);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  
  // Temporary storage for variants before they are added to the main list
  const [tempVariants, setTempVariants] = useState<GeneratedDesign[]>([]);
  // Selection set for batch adding
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  // Batch Configuration State
  const [globalCount, setGlobalCount] = useState<number>(1);
  const [individualCounts, setIndividualCounts] = useState<Record<string, number>>({});
  
  // Image Generation Config
  const [imageSize, setImageSize] = useState<string>("1K");

  // Sync individual counts when selected nodes change (initialize new ones)
  useEffect(() => {
      setIndividualCounts(prev => {
          const next = { ...prev };
          selectedNodes.forEach(node => {
              if (next[node.id] === undefined) {
                  next[node.id] = globalCount;
              }
          });
          return next;
      });
  }, [selectedNodes]);

  // Calculate Session Stats
  const sessionStats = useMemo(() => {
    return generatedDesigns.reduce((acc, design) => {
        const meta = design.generationMetadata;
        if (meta?.cost && meta?.usage) {
            acc.totalUSD += meta.cost.totalUSD;
            acc.totalCNY += meta.cost.totalCNY;
            acc.inputTokens += meta.usage.promptTokens;
            acc.outputTokens += meta.usage.candidatesTokens;
            acc.totalTokens += meta.usage.totalTokens;
        }
        return acc;
    }, { totalUSD: 0, totalCNY: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  }, [generatedDesigns]);

  // Update all when global slider changes
  const handleGlobalCountChange = (val: number) => {
      setGlobalCount(val);
      setIndividualCounts(prev => {
          const next = { ...prev };
          selectedNodes.forEach(node => {
             next[node.id] = val;
          });
          return next;
      });
  };

  const updateIndividualCount = (id: string, delta: number) => {
      setIndividualCounts(prev => ({
          ...prev,
          [id]: Math.max(1, Math.min(4, (prev[id] || 1) + delta))
      }));
  };

  // Helper to toggle main diamond color
  const toggleMainColor = (colorId: string) => {
    if (selection.mainDiamondColorId === colorId) {
        setSelection({ ...selection, mainDiamondColorId: undefined });
    } else {
        setSelection({ ...selection, mainDiamondColorId: colorId });
    }
  };

  // Helper to toggle secondary diamond colors
  const toggleSecondaryColor = (colorId: string) => {
    const current = selection.secondaryDiamondColorIds || [];
    if (current.includes(colorId)) {
        setSelection({ ...selection, secondaryDiamondColorIds: current.filter(id => id !== colorId) });
    } else {
        setSelection({ ...selection, secondaryDiamondColorIds: [...current, colorId] });
    }
  };

  // Resolve current selection objects for display helpers
  const selectedMaterial = library.materials.find(m => m.id === selection.materialId);
  const selectedProcess = library.processes.find(p => p.id === selection.processId);
  const selectedStyle = library.styles.find(s => s.id === selection.styleId);

  const calculateTotalRequests = () => {
      let total = 0;
      selectedNodes.forEach(node => {
          total += (individualCounts[node.id] || 1);
      });
      return total;
  };

  const handleBatchGenerate = async () => {
    if (selectedNodes.length === 0) return;
    setIsGenerating(true);

    const totalRequests = calculateTotalRequests();
    if (totalRequests > 10) {
        if (!window.confirm(`即将生成 ${totalRequests} 张图片，这可能需要较长时间。确定继续吗？`)) {
            setIsGenerating(false);
            return;
        }
    }

    try {
      const tasks: Promise<GeneratedDesign | null>[] = [];

      // Loop through selected concepts
      for (const node of selectedNodes) {
          const count = individualCounts[node.id] || 1;
          
          // Loop Quantity Count
          for (let i = 0; i < count; i++) {
              
              // Create the task using fixed global selection
              const task = async () => {
                  try {
                      // Using node.text as concept
                      // Pass imageSize to the service
                      const result = await generatePhoneCaseDesign(selection, library, node.text, node.text, imageSize);
                      
                      if (result && result.imageUrl) {
                          return {
                              id: Date.now().toString() + Math.random(),
                              imageUrl: result.imageUrl,
                              concept: node.text,
                              configSummary: `${selectedMaterial?.name} + ${selectedProcess?.name}${selectedStyle ? ` + ${selectedStyle.name}` : ''}`,
                              timestamp: Date.now(),
                              generationMetadata: result.metadata
                          } as GeneratedDesign;
                      }
                  } catch (err) {
                      console.error("Single generation failed", err);
                  }
                  return null;
              };

              tasks.push(task());
          }
      }

      // Execute in parallel
      const results = await Promise.all(tasks);
      const validResults = results.filter(r => r !== null) as GeneratedDesign[];
      
      setGeneratedDesigns(prev => [...validResults, ...prev]);

    } catch (e) {
      alert("Error generating designs. Please check your network and API usage.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVariants = async () => {
      if (!activePreview) return;
      setIsGeneratingVariants(true);
      setTempVariants([]); // Clear previous results
      setSelectedVariantIds(new Set()); // Clear selection
      
      try {
          // Keep panel open
          const variants = await generateDesignVariants(activePreview, variantCount, library.prompts);
          setTempVariants(variants);
          // Auto select all generated variants by default
          setSelectedVariantIds(new Set(variants.map(v => v.id)));
      } catch (e) {
          console.error("Variant generation failed", e);
          alert("变体生成失败，请稍后重试。");
      } finally {
          setIsGeneratingVariants(false);
      }
  };

  const handleToggleVariantSelection = (id: string) => {
      const next = new Set(selectedVariantIds);
      if (next.has(id)) {
          next.delete(id);
      } else {
          next.add(id);
      }
      setSelectedVariantIds(next);
  };

  const handleAddVariantsToStudio = () => {
      const toAdd = tempVariants.filter(v => selectedVariantIds.has(v.id));
      if (toAdd.length === 0) return;

      setGeneratedDesigns(prev => [...toAdd, ...prev]);
      // Close modal and cleanup
      setActivePreview(null);
      setIsVariantPanelOpen(false);
      setTempVariants([]);
      setSelectedVariantIds(new Set());
  };

  const handleDownload = (url: string, id: string) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `casecraft-${id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const openPreview = (design: GeneratedDesign) => {
      setActivePreview(design);
      setShowInfo(false); 
      setIsVariantPanelOpen(false); // Default closed
      setTempVariants([]); // Reset temp variants
      setVariantCount(2);
  }

  return (
    <div className="h-full flex bg-white overflow-hidden">
      
      {/* LEFT SIDEBAR: UNIFIED CONFIGURATION */}
      <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden z-20 shadow-xl flex-shrink-0">
          <div className="p-5 border-b border-gray-200 bg-white">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-indigo-600" />
                  生成配置
              </h2>
              <p className="text-xs text-gray-500 mt-1">配置底材、工艺及生成参数</p>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8">
              
              {/* SECTION 1: DESIGN CONFIG (Material/Process/Style) */}
              <div className="space-y-6">
                
                {/* Material Selector */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">手机壳底材</h3>
                    <div className="space-y-2">
                        <select 
                            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 shadow-sm"
                            value={selection.materialId}
                            onChange={(e) => setSelection({...selection, materialId: e.target.value})}
                        >
                            {library.materials.map(m => (
                                <option key={m.id} value={m.id}>{m.name} ({m.model})</option>
                            ))}
                        </select>
                        {selectedMaterial && (
                            <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200 relative group overflow-hidden">
                                <div className="mb-2">
                                    {selectedMaterial.type} · {selectedMaterial.color}
                                </div>
                                {selectedMaterial.previewUrl && (
                                    <img src={selectedMaterial.previewUrl} className="w-full h-32 object-contain bg-gray-50 border rounded" alt="Base" />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Process Selector */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">工艺效果</h3>
                    <div className="space-y-2">
                        <select 
                            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 shadow-sm"
                            value={selection.processId}
                            onChange={(e) => setSelection({...selection, processId: e.target.value})}
                        >
                            {library.processes.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        {selectedProcess && (
                            <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200">
                                <div className="mb-2">{selectedProcess.description}</div>
                                {selectedProcess.previewUrl && (
                                    <img src={selectedProcess.previewUrl} className="w-full h-24 object-cover rounded" alt="Process" />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* DIAMOND SPECIFIC CONFIGURATION */}
                {selectedProcess?.category === 'diamond' && (
                    <div className="space-y-6 bg-gradient-to-b from-blue-50 to-purple-50 p-4 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider mb-2">
                            <Gem className="w-4 h-4" /> 满钻工艺配置
                        </div>

                        {/* Main Diamond Color */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase">水钻主色 (底色)</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {library.mainDiamondColors?.map(dc => (
                                    <button
                                        key={dc.id}
                                        onClick={() => toggleMainColor(dc.id)}
                                        className={`
                                            relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                                            ${selection.mainDiamondColorId === dc.id ? 'border-indigo-600 scale-105 shadow-md' : 'border-gray-200 opacity-70 hover:opacity-100 bg-white'}
                                        `}
                                        title={dc.name}
                                    >
                                        <img src={dc.previewUrl} className="w-full h-full object-cover" alt={dc.name} />
                                        {selection.mainDiamondColorId === dc.id && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                <div className="w-2 h-2 bg-white rounded-full shadow-sm"></div>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-500 text-right">
                                {library.mainDiamondColors?.find(c => c.id === selection.mainDiamondColorId)?.name || '未选择 (默认)'}
                            </p>
                        </div>

                        {/* Secondary Diamond Colors */}
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase">水钻副色 (可多选)</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {library.secondaryDiamondColors?.map(dc => {
                                    const isSelected = selection.secondaryDiamondColorIds?.includes(dc.id);
                                    return (
                                        <button
                                            key={dc.id}
                                            onClick={() => toggleSecondaryColor(dc.id)}
                                            className={`
                                                relative aspect-square rounded-lg overflow-hidden border transition-all group
                                                ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-gray-200 bg-white'}
                                            `}
                                            title={dc.name}
                                        >
                                            <img src={dc.previewUrl} className={`w-full h-full object-cover transition-all ${isSelected ? '' : 'grayscale group-hover:grayscale-0'}`} alt={dc.name} />
                                            {isSelected && (
                                                <div className="absolute top-0 right-0 bg-indigo-600 text-white p-0.5 rounded-bl">
                                                    <Check className="w-2 h-2" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Style Selector */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">风格预设 (可选)</h3>
                    <div className="space-y-2">
                        <select 
                            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 shadow-sm"
                            value={selection.styleId}
                            onChange={(e) => setSelection({...selection, styleId: e.target.value})}
                        >
                            <option value="">无风格 (使用模型默认)</option>
                            {library.styles.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        {selectedStyle && (
                            <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200">
                                <div className="mb-2 font-mono text-[10px] opacity-70 truncate" title={selectedStyle.promptModifier}>{selectedStyle.promptModifier}</div>
                                {selectedStyle.previewUrl && (
                                    <img src={selectedStyle.previewUrl} className="w-full h-24 object-cover rounded" alt="Style" />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* System Prompt */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">额外 Prompt</h3>
                    <textarea 
                        placeholder="输入自定义指令..."
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs h-16 text-gray-600 resize-none outline-none focus:border-indigo-500 shadow-sm"
                        value={selection.customSystemPrompt}
                        onChange={(e) => setSelection({...selection, customSystemPrompt: e.target.value})}
                    />
                </div>

              </div>

              <div className="h-px bg-gray-200"></div>

              {/* SECTION 2: GENERATION SETTINGS */}
              <div className="space-y-6">
                
                {/* Resolution Setting */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">分辨率 (Resolution)</h3>
                        <span className="text-[10px] text-gray-400">{imageSize}</span>
                    </div>
                    <select
                        value={imageSize}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 shadow-sm"
                    >
                        <option value="1K">1K (标准 - 1024x1792)</option>
                        <option value="2K">2K (高清 - 1792x3072)</option>
                        <option value="4K">4K (超清 - 3584x6144)</option>
                    </select>
                    <p className="text-[10px] text-gray-400 leading-tight">
                        * 4K 分辨率生成速度较慢且 Token 消耗较高。推荐使用 1K 进行快速迭代。
                    </p>
                </div>

                {/* Global Quantity Control */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">统一数量设置</h3>
                        <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{globalCount} 张/个</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        step="1" 
                        value={globalCount}
                        onChange={(e) => handleGlobalCountChange(parseInt(e.target.value))}
                        className="w-full accent-indigo-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                {/* Selected Concepts List */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex justify-between">
                        <span>已选概念 ({selectedNodes.length})</span>
                        <span className="text-[10px] text-gray-400 font-normal">可单独调整</span>
                    </h3>
                    
                    {selectedNodes.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                            <p>请在脑暴画布中<br/>勾选需要生成的概念</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {selectedNodes.map(node => (
                                <div key={node.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between group">
                                    <div className="min-w-0 flex-1 mr-2">
                                        <div className="font-medium text-sm text-gray-800 truncate" title={node.text}>{node.text}</div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 bg-gray-50 rounded p-0.5">
                                        <button 
                                            onClick={() => updateIndividualCount(node.id, -1)}
                                            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all"
                                            disabled={(individualCounts[node.id] || 1) <= 1}
                                        >
                                            <Minus className="w-3 h-3" />
                                        </button>
                                        <span className="text-xs font-mono w-4 text-center font-medium">
                                            {individualCounts[node.id] || 1}
                                        </span>
                                        <button 
                                            onClick={() => updateIndividualCount(node.id, 1)}
                                            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white rounded shadow-sm transition-all"
                                            disabled={(individualCounts[node.id] || 1) >= 4}
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
              </div>

          </div>

          {/* Action Footer */}
          <div className="p-5 border-t border-gray-200 bg-white">
              <div className="mb-3 flex justify-between text-xs text-gray-500">
                  <span>总计任务</span>
                  <span>预计生成: <span className="font-bold text-indigo-600">{calculateTotalRequests()}</span> 张</span>
              </div>
              <button
                onClick={handleBatchGenerate}
                disabled={isGenerating || selectedNodes.length === 0}
                className={`
                    w-full py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center justify-center gap-2
                    ${isGenerating || selectedNodes.length === 0 
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-indigo-200 hover:scale-[1.02]'
                    }
                `}
                >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                {isGenerating ? '生成中...' : `开始生成`}
             </button>
          </div>
      </div>

      {/* RIGHT MAIN: GALLERY */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
             <div>
                <h2 className="text-2xl font-bold text-gray-800">设计工坊 (Studio)</h2>
                <div className="flex items-center gap-2 mt-1">
                     <span className="text-gray-500 text-sm">统一预览和管理所有生成结果</span>
                     {generatedDesigns.length > 0 && (
                         <span className="bg-indigo-50 text-indigo-600 text-xs px-2 py-0.5 rounded-full font-medium">
                             Count: {generatedDesigns.length}
                         </span>
                     )}
                </div>
             </div>
             
             {/* SESSION STATS (Aggregate) */}
             {generatedDesigns.length > 0 && (
                <div className="flex items-center gap-6 bg-gray-50 px-4 py-2 rounded-xl border border-gray-200">
                     <div className="flex flex-col items-end">
                         <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Tokens</span>
                         <div className="text-sm font-medium text-gray-600 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {sessionStats.totalTokens.toLocaleString()}
                            <span className="text-[10px] text-gray-400 font-normal ml-1">
                                (In: {sessionStats.inputTokens.toLocaleString()} / Out: {sessionStats.outputTokens.toLocaleString()})
                            </span>
                         </div>
                     </div>
                     <div className="w-px h-8 bg-gray-200"></div>
                     <div className="flex flex-col items-end">
                         <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Session Cost</span>
                         <div className="text-lg font-bold text-indigo-600 flex items-baseline gap-1">
                            <span>¥{sessionStats.totalCNY.toFixed(2)}</span>
                            <span className="text-xs text-gray-400 font-normal">(${sessionStats.totalUSD.toFixed(3)})</span>
                         </div>
                     </div>
                </div>
             )}
          </div>

          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {generatedDesigns.map(design => (
                  <div key={design.id} className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100">
                    <div className="aspect-[9/16] bg-gray-100 relative overflow-hidden">
                       <img src={design.imageUrl} alt={design.concept} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                       
                       {/* CONCEPT LABEL OVERLAY */}
                       <div className="absolute top-2 left-2 right-2 flex justify-start pointer-events-none">
                           <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-1 rounded-md shadow-sm truncate max-w-full">
                               {design.concept}
                           </span>
                       </div>

                       {/* Overlay Actions */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                          <button onClick={() => openPreview(design)} className="p-3 bg-white/20 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md transition-all" title="放大预览">
                            <Maximize2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleDownload(design.imageUrl, design.id)} className="p-3 bg-white/20 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md transition-all" title="下载图片">
                            <Download className="w-5 h-5" />
                          </button>
                       </div>
                    </div>
                    
                    <div className="p-3">
                      {/* Compact info below */}
                      <div className="flex justify-between items-start">
                           <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight flex-1 mr-2">
                             {design.configSummary}
                           </p>
                           {design.generationMetadata?.model?.includes('pro') && <span className="text-[9px] bg-purple-100 text-purple-600 px-1 rounded font-bold">PRO</span>}
                      </div>
                    </div>
                  </div>
                ))}
             </div>

             {/* Empty State */}
             {generatedDesigns.length === 0 && !isGenerating && (
               <div className="h-full flex flex-col items-center justify-center text-gray-400 pb-20">
                  <div className="w-20 h-20 rounded-2xl bg-white border border-dashed border-gray-300 flex items-center justify-center mb-6 shadow-sm">
                    <Wand2 className="w-8 h-8 opacity-20 text-indigo-500" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-600">工作台准备就绪</h3>
                  <p className="text-sm max-w-xs text-center mt-2 opacity-70">
                      请返回“设计画布”，勾选需要生成的概念，<br/>然后在此处批量生成。
                  </p>
               </div>
             )}
          </div>
      </div>

      {/* REFACTORED MODAL PREVIEW */}
      {activePreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm overflow-hidden" onClick={() => setActivePreview(null)}>
           <div className="relative w-full h-full flex" onClick={e => e.stopPropagation()}>
              
              {/* LEFT: MAIN IMAGE CONTAINER */}
              <div className={`
                 relative h-full flex flex-col items-center justify-center p-8 transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
                 ${isVariantPanelOpen ? 'w-[calc(100%-500px)]' : 'w-full'}
              `}>
                  {/* Image wrapper */}
                  <div className={`relative transition-all duration-500 ${isVariantPanelOpen ? 'scale-90 translate-x-[-20px]' : ''}`}>
                      <img 
                         src={activePreview.imageUrl} 
                         className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain" 
                         alt="Preview" 
                      />
                      
                      {/* Close Button (Left side when open?) -> Keep Top Right of Viewport but adjusted */}
                      <button onClick={() => setActivePreview(null)} className="absolute -top-4 -right-4 bg-white text-black p-2 rounded-full shadow-lg z-10 hover:bg-gray-100">
                        <X className="w-5 h-5" />
                      </button>

                      {/* Floating Concept Tag */}
                      <div className="absolute top-6 left-6 pointer-events-none">
                           <span className="bg-black/50 backdrop-blur text-white text-sm font-bold px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                               {activePreview.concept}
                           </span>
                      </div>
                  </div>
                  
                  {/* BOTTOM ACTION BAR */}
                  <div className="absolute bottom-8 flex gap-4 pointer-events-auto">
                      {/* Toggle Variant Panel Button */}
                      <button 
                         onClick={() => setIsVariantPanelOpen(!isVariantPanelOpen)} 
                         className={`
                            px-6 py-3 rounded-full shadow-lg transition-all border font-bold flex items-center gap-2
                            ${isVariantPanelOpen 
                                ? 'bg-white text-indigo-600 border-indigo-200 hover:shadow-xl' 
                                : 'bg-black/60 text-white border-white/20 hover:bg-black/80 backdrop-blur'
                            }
                         `}
                      >
                         <Sparkles className="w-4 h-4" />
                         {isVariantPanelOpen ? '关闭设计师 Agent' : '设计师 Agent (变体)'}
                      </button>

                      <button 
                         onClick={() => setShowInfo(!showInfo)} 
                         className={`p-3 rounded-full shadow-lg transition-all border border-white/20 ${showInfo ? 'bg-white text-indigo-600' : 'bg-black/60 text-white hover:bg-black/80 backdrop-blur'}`}
                         title="查看生成信息"
                      >
                         <Info className="w-6 h-6" />
                      </button>
                  </div>
              </div>

              {/* RIGHT: VARIANT PANEL (SLIDE IN) */}
              <div className={`
                 w-[500px] h-full bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] absolute right-0 top-0
                 ${isVariantPanelOpen ? 'translate-x-0' : 'translate-x-full'}
              `}>
                  
                  {/* Panel Header */}
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="font-bold text-gray-800 flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-indigo-600"/> 变体设计
                          </h3>
                          <p className="text-[10px] text-gray-500 mt-1">基于 "{activePreview.concept}" 重新构思图案</p>
                      </div>
                      <button onClick={() => setIsVariantPanelOpen(false)} className="p-1 hover:bg-gray-200 rounded text-gray-500"><ArrowRight className="w-4 h-4"/></button>
                  </div>

                  {/* Settings & Generate Section */}
                  <div className="p-5 border-b border-gray-100 space-y-4">
                      <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-xs text-indigo-800">
                          <strong>Agent 任务:</strong> 保持底材与工艺不变，重新设计图案的分布、大小和配色。
                      </div>
                      
                      <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-gray-700">生成数量</span>
                           <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                                <button onClick={() => setVariantCount(Math.max(1, variantCount - 1))} className="text-gray-500 hover:text-indigo-600"><Minus className="w-3 h-3"/></button>
                                <span className="text-xs font-mono w-4 text-center">{variantCount}</span>
                                <button onClick={() => setVariantCount(Math.min(4, variantCount + 1))} className="text-gray-500 hover:text-indigo-600"><Plus className="w-3 h-3"/></button>
                           </div>
                      </div>

                      <button 
                           onClick={handleGenerateVariants}
                           disabled={isGeneratingVariants}
                           className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                       >
                           {isGeneratingVariants ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                           {isGeneratingVariants ? "设计师正在构思..." : "生成新变体"}
                       </button>
                  </div>

                  {/* Results List (Scrollable) */}
                  <div className="flex-1 overflow-y-auto p-5 bg-gray-50 space-y-4">
                      {isGeneratingVariants && tempVariants.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                              <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2"/>
                              <span className="text-xs">正在请求 Gemini 3 Pro...</span>
                          </div>
                      )}

                      {!isGeneratingVariants && tempVariants.length === 0 && (
                          <div className="text-center text-gray-400 py-10 text-xs">
                              暂无变体，请点击上方按钮生成
                          </div>
                      )}

                      {/* Variant Items */}
                      {tempVariants.map((variant, idx) => {
                          const isSelected = selectedVariantIds.has(variant.id);
                          return (
                              <div 
                                key={variant.id} 
                                onClick={() => handleToggleVariantSelection(variant.id)}
                                className={`
                                    relative bg-white rounded-xl overflow-hidden border-2 transition-all cursor-pointer group shadow-sm hover:shadow-md
                                    ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-gray-300'}
                                `}
                              >
                                  {/* Selection Checkbox */}
                                  <div className={`
                                      absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md
                                      ${isSelected ? 'bg-indigo-600 text-white' : 'bg-white text-gray-300 border border-gray-200'}
                                  `}>
                                      <Check className="w-3.5 h-3.5" />
                                  </div>

                                  <div className="aspect-[9/16] bg-gray-100 relative">
                                      <img src={variant.imageUrl} className="w-full h-full object-cover" alt={`Variant ${idx}`} />
                                      {/* Prompt preview on hover */}
                                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <p className="text-[10px] text-white line-clamp-2">{variant.generationMetadata?.prompt}</p>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>

                  {/* Footer Action */}
                  {tempVariants.length > 0 && (
                      <div className="p-5 border-t border-gray-200 bg-white">
                          <button 
                             onClick={handleAddVariantsToStudio}
                             disabled={selectedVariantIds.size === 0}
                             className={`
                                w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2
                                ${selectedVariantIds.size > 0 
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02]' 
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
                             `}
                          >
                             <Save className="w-4 h-4" />
                             加入工坊 ({selectedVariantIds.size})
                          </button>
                      </div>
                  )}

              </div>

              {/* INFO PANEL (Slide Over over the right side or modal) */}
              {showInfo && (
                  <div className="absolute right-10 top-20 bottom-20 w-80 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-10 fade-in duration-300 z-30 border border-gray-100">
                      <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                          <h3 className="font-bold text-gray-800">生成参数详情</h3>
                          <button onClick={() => setShowInfo(false)} className=""><X className="w-4 h-4"/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 space-y-6">
                           {/* COST & USAGE SECTION */}
                           <div className="bg-gray-900 rounded-xl p-4 text-white shadow-lg relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-10"><Calculator className="w-16 h-16"/></div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                                   <Coins className="w-3 h-3 text-yellow-400" /> 成本与Token分析
                               </h4>
                               
                               <div className="space-y-3 relative z-10">
                                   <div className="flex justify-between items-baseline border-b border-gray-700 pb-2">
                                       <span className="text-xs text-gray-400">预估费用</span>
                                       <div className="text-right">
                                           <div className="text-lg font-bold text-yellow-400">¥{activePreview.generationMetadata?.cost?.totalCNY.toFixed(4) || '0.00'}</div>
                                           <div className="text-[10px] text-gray-500">${activePreview.generationMetadata?.cost?.totalUSD.toFixed(5) || '0.00'}</div>
                                       </div>
                                   </div>
                               </div>
                           </div>
                           
                           {/* Reference Images - Moved UP for better visibility */}
                           {activePreview.generationMetadata?.referenceImages && activePreview.generationMetadata.referenceImages.length > 0 ? (
                               <div className="animate-in fade-in slide-in-from-right-2">
                                   <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                       <ImageIcon className="w-3 h-3" /> 参考素材 (Ref Images)
                                   </h4>
                                   <div className="grid grid-cols-2 gap-3">
                                       {activePreview.generationMetadata.referenceImages.map((img, i) => (
                                           <div key={i} className="flex flex-col gap-1.5 group">
                                               <div className="aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative shadow-sm group-hover:shadow-md transition-all">
                                                   <img src={`data:${img.mimeType};base64,${img.data}`} className="w-full h-full object-contain" alt={img.label} />
                                               </div>
                                               <span className="text-[10px] font-medium text-gray-600 truncate px-1" title={img.label}>
                                                   {i+1}. {img.label}
                                               </span>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           ) : (
                               <div className="p-4 rounded-lg border border-dashed border-gray-200 text-center">
                                    <span className="text-[10px] text-gray-400">无参考图片 (纯文本生成)</span>
                               </div>
                           )}

                           {/* Config Summary */}
                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">配置组合</h4>
                               <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
                                   {activePreview.configSummary}
                               </div>
                           </div>

                           {/* Prompt */}
                           <div>
                               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <FileText className="w-3 h-3" /> 最终 Prompt
                               </h4>
                               <div className="bg-gray-50 p-3 rounded border border-gray-100 font-mono text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin">
                                   {activePreview.generationMetadata?.prompt || "无数据"}
                               </div>
                           </div>
                      </div>
                  </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default DesignGenerator;
