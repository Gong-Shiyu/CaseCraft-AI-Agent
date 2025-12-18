
import React, { useState, useRef } from 'react';
import { Library, MaterialOption, ProcessOption, StyleOption, SystemPrompts, DiamondColor } from '../types';
import { Plus, Trash2, Upload, Save, Edit2, Check, MessageSquare, RotateCcw, Activity, ShieldCheck, ShieldAlert, Loader2, Gem } from 'lucide-react';
import { DEFAULT_LIBRARY } from '../App';
import { listGeminiModels } from '../services/geminiService';

interface SettingsPageProps {
  library: Library;
  setLibrary: React.Dispatch<React.SetStateAction<Library>>;
}

// Helper to resize and compress images
const resizeImage = (file: File, maxWidthHeight: number = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidthHeight) {
                        height = Math.round(height * (maxWidthHeight / width));
                        width = maxWidthHeight;
                    }
                } else {
                    if (height > maxWidthHeight) {
                        width = Math.round(width * (maxWidthHeight / height));
                        height = maxWidthHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                
                // Export as JPEG with reduced quality to save space
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const SettingsPage: React.FC<SettingsPageProps> = ({ library, setLibrary }) => {
  const [activeTab, setActiveTab] = useState<'material' | 'process' | 'style' | 'diamond' | 'prompt' | 'diagnostic'>('material');
  const [diamondSubTab, setDiamondSubTab] = useState<'main' | 'secondary'>('main');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form buffers
  const [newMaterial, setNewMaterial] = useState<Partial<MaterialOption>>({ type: 'plastic', model: 'iPhone 15 Pro' });
  const [newProcess, setNewProcess] = useState<Partial<ProcessOption>>({});
  const [newStyle, setNewStyle] = useState<Partial<StyleOption>>({});
  const [newDiamondColor, setNewDiamondColor] = useState<Partial<DiamondColor>>({});
  
  // Prompt Buffer
  const [localPrompts, setLocalPrompts] = useState<SystemPrompts>(library.prompts);
  const [promptSaved, setPromptSaved] = useState(false);

  // Diagnostics State
  const [diagModels, setDiagModels] = useState<any[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'material' | 'process' | 'style' | 'diamond') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
        const resizedBase64 = await resizeImage(file);
        
        if (field === 'material') {
            setNewMaterial(prev => ({ ...prev, previewUrl: resizedBase64 }));
        }
        if (field === 'process') {
            setNewProcess(prev => ({ ...prev, previewUrl: resizedBase64 }));
        }
        if (field === 'style') {
            setNewStyle(prev => ({ ...prev, previewUrl: resizedBase64 }));
        }
        if (field === 'diamond') {
            setNewDiamondColor(prev => ({ ...prev, previewUrl: resizedBase64 }));
        }
    } catch (error) {
        console.error("Error processing image:", error);
        alert("图片处理失败，请重试");
    }
  };

  // --- SAVE HANDLERS ---

  const handleSaveMaterial = () => {
    if (!newMaterial.name || !newMaterial.model) return;
    
    if (editingId) {
        setLibrary(prev => ({
            ...prev,
            materials: prev.materials.map(m => m.id === editingId ? { ...m, ...newMaterial } as MaterialOption : m)
        }));
        setEditingId(null);
    } else {
        setLibrary(prev => ({
            ...prev,
            materials: [...prev.materials, { ...newMaterial, id: Date.now().toString() } as MaterialOption]
        }));
    }
    setNewMaterial({ type: 'plastic', model: 'iPhone 15 Pro', name: '', color: '', previewUrl: '' });
  };

  const handleSaveProcess = () => {
    if (!newProcess.name) return;

    if (editingId) {
        setLibrary(prev => ({
            ...prev,
            processes: prev.processes.map(p => p.id === editingId ? { ...p, ...newProcess } as ProcessOption : p)
        }));
        setEditingId(null);
    } else {
        setLibrary(prev => ({
            ...prev,
            processes: [...prev.processes, { ...newProcess, id: Date.now().toString() } as ProcessOption]
        }));
    }
    setNewProcess({ name: '', description: '', previewUrl: '' });
  };

  const handleSaveStyle = () => {
    if (!newStyle.name) return;

    if (editingId) {
        setLibrary(prev => ({
            ...prev,
            styles: prev.styles.map(s => s.id === editingId ? { ...s, ...newStyle } as StyleOption : s)
        }));
        setEditingId(null);
    } else {
        setLibrary(prev => ({
            ...prev,
            styles: [...prev.styles, { ...newStyle, id: Date.now().toString() } as StyleOption]
        }));
    }
    setNewStyle({ name: '', promptModifier: '', previewUrl: '' });
  };

  const handleSaveDiamondColor = () => {
    if (!newDiamondColor.name) return;
    
    // Determine which list to update based on current subtab
    const targetList = diamondSubTab === 'main' ? 'mainDiamondColors' : 'secondaryDiamondColors';

    if (editingId) {
        setLibrary(prev => ({
            ...prev,
            [targetList]: (prev[targetList] || []).map(d => d.id === editingId ? { ...d, ...newDiamondColor } as DiamondColor : d)
        }));
        setEditingId(null);
    } else {
        setLibrary(prev => ({
            ...prev,
            [targetList]: [...(prev[targetList] || []), { ...newDiamondColor, id: Date.now().toString() } as DiamondColor]
        }));
    }
    setNewDiamondColor({ name: '', previewUrl: '' });
  };

  const handleSavePrompts = () => {
      setLibrary(prev => ({
          ...prev,
          prompts: localPrompts
      }));
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 2000);
  };

  const handleResetDefaults = () => {
      if (confirm('确定要重置所有配置为系统默认吗？这将覆盖您当前的所有修改。')) {
          setLibrary(DEFAULT_LIBRARY);
          setLocalPrompts(DEFAULT_LIBRARY.prompts);
      }
  };

  // --- DIAGNOSTICS HANDLER ---
  const handleRunDiagnostics = async () => {
      setDiagLoading(true);
      setDiagError(null);
      setDiagModels([]);
      try {
          const models = await listGeminiModels();
          // Sort to prioritize generateContent models
          const sorted = models.sort((a, b) => {
              const aGen = a.supportedGenerationMethods?.includes('generateContent');
              const bGen = b.supportedGenerationMethods?.includes('generateContent');
              if (aGen && !bGen) return -1;
              if (!aGen && bGen) return 1;
              return 0;
          });
          setDiagModels(sorted);
      } catch (e: any) {
          setDiagError(e.message || "Failed to fetch models");
      } finally {
          setDiagLoading(false);
      }
  };

  // --- EDIT HANDLERS ---

  const handleEdit = (type: 'material' | 'process' | 'style' | 'diamond', item: any) => {
      setEditingId(item.id);
      if (type === 'material') setNewMaterial({ ...item });
      if (type === 'process') setNewProcess({ ...item });
      if (type === 'style') setNewStyle({ ...item });
      if (type === 'diamond') setNewDiamondColor({ ...item });
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setNewMaterial({ type: 'plastic', model: 'iPhone 15 Pro', name: '', color: '', previewUrl: '' });
      setNewProcess({ name: '', description: '', previewUrl: '' });
      setNewStyle({ name: '', promptModifier: '', previewUrl: '' });
      setNewDiamondColor({ name: '', previewUrl: '' });
  }

  const handleDelete = (e: React.MouseEvent, type: 'materials' | 'processes' | 'styles' | 'mainDiamondColors' | 'secondaryDiamondColors', id: string) => {
    e.stopPropagation(); // Fix deletion issue
    if (confirm('确定要删除这个配置吗？')) {
        setLibrary(prev => ({
          ...prev,
          [type]: (prev[type] as any[]).filter((item: any) => item.id !== id)
        }));
        if (editingId === id) handleCancelEdit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <header className="bg-white border-b px-8 py-6 flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">产品形态配置</h1>
            <p className="text-gray-500 text-sm mt-1">扩展和管理系统的底材、工艺及风格库 (修改自动保存到本地数据库)</p>
        </div>
        <button 
            onClick={handleResetDefaults}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors"
            title="恢复到初始状态（加载新的 assets 资源）"
        >
            <RotateCcw className="w-4 h-4" /> 重置为默认库
        </button>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Sub-sidebar for Settings */}
        <div className="w-48 bg-white border-r border-gray-200 flex flex-col pt-4">
          <button 
            onClick={() => { setActiveTab('material'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium ${activeTab === 'material' ? 'text-indigo-600 bg-indigo-50 border-r-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            手机壳底材
          </button>
          <button 
            onClick={() => { setActiveTab('process'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium ${activeTab === 'process' ? 'text-indigo-600 bg-indigo-50 border-r-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            工艺配置
          </button>
          <button 
            onClick={() => { setActiveTab('diamond'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'diamond' ? 'text-blue-600 bg-blue-50 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Gem className="w-4 h-4" /> 水钻库
          </button>
          <button 
            onClick={() => { setActiveTab('style'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium ${activeTab === 'style' ? 'text-indigo-600 bg-indigo-50 border-r-2 border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            风格库
          </button>
          <div className="h-px bg-gray-200 my-2 mx-4"></div>
          <button 
            onClick={() => { setActiveTab('prompt'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'prompt' ? 'text-purple-600 bg-purple-50 border-r-2 border-purple-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <MessageSquare className="w-4 h-4" /> 提示词配置
          </button>
          <button 
            onClick={() => { setActiveTab('diagnostic'); handleCancelEdit(); }}
            className={`text-left px-6 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'diagnostic' ? 'text-amber-600 bg-amber-50 border-r-2 border-amber-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Activity className="w-4 h-4" /> API 诊断
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* MATERIAL TAB */}
          {activeTab === 'material' && (
            <div className="max-w-3xl space-y-8">
              <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200'}`}>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  {editingId ? <Edit2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4" />} 
                  {editingId ? '编辑底材' : '添加新底材'}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    placeholder="名称 (如: 黑色磨砂全包)" 
                    className="border p-2 rounded text-sm"
                    value={newMaterial.name || ''} 
                    onChange={e => setNewMaterial({...newMaterial, name: e.target.value})}
                  />
                  <input 
                    placeholder="适用型号 (如: iPhone 15)" 
                    className="border p-2 rounded text-sm"
                    value={newMaterial.model || ''} 
                    onChange={e => setNewMaterial({...newMaterial, model: e.target.value})}
                  />
                  <input 
                    placeholder="颜色" 
                    className="border p-2 rounded text-sm"
                    value={newMaterial.color || ''} 
                    onChange={e => setNewMaterial({...newMaterial, color: e.target.value})}
                  />
                  <select 
                    className="border p-2 rounded text-sm bg-white"
                    value={newMaterial.type}
                    onChange={e => setNewMaterial({...newMaterial, type: e.target.value})}
                  >
                    <option value="plastic">塑料 (Plastic)</option>
                    <option value="silicone">硅胶 (Silicone)</option>
                    <option value="shockproof">防摔 (Shockproof)</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden relative"
                      >
                        {newMaterial.previewUrl ? (
                          <img src={newMaterial.previewUrl} className="w-full h-full object-cover" />
                        ) : (
                          <>
                             <Upload className="w-5 h-5 text-gray-400" />
                             <span className="text-[10px] text-gray-500 mt-1">上传底图</span>
                          </>
                        )}
                        <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'material')} />
                      </div>
                      
                  </div>
                  <div className="flex gap-2">
                     {editingId && (
                         <button onClick={handleCancelEdit} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">取消</button>
                     )}
                     <button onClick={handleSaveMaterial} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2">
                         {editingId ? <><Check className="w-4 h-4"/> 更新底材</> : '保存添加'}
                     </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-400 uppercase">现有底材库</h4>
                {library.materials.map(item => (
                  <div key={item.id} className={`flex items-center justify-between p-4 bg-white border rounded-lg ${editingId === item.id ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                         {item.previewUrl && <img src={item.previewUrl} className="w-full h-full object-cover" />}
                       </div>
                       <div>
                         <p className="font-medium text-gray-800">{item.name}</p>
                         <p className="text-xs text-gray-500">{item.model} · {item.type} · {item.color}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit('material', item)} className="p-2 text-indigo-500 hover:bg-indigo-100 rounded"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => handleDelete(e, 'materials', item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PROCESS TAB */}
          {activeTab === 'process' && (
            <div className="max-w-3xl space-y-8">
              <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200'}`}>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    {editingId ? <Edit2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4" />} 
                    {editingId ? '编辑工艺' : '添加新工艺'}
                </h3>
                <div className="space-y-3">
                  <input 
                    placeholder="工艺名称 (如: 满钻贴钻, UV浮雕)" 
                    className="w-full border p-2 rounded text-sm"
                    value={newProcess.name || ''} 
                    onChange={e => setNewProcess({...newProcess, name: e.target.value})}
                  />
                  <div>
                    <textarea 
                      placeholder="工艺描述 (用于生成提示词)" 
                      className="w-full border p-2 rounded text-sm h-20"
                      value={newProcess.description || ''} 
                      onChange={e => setNewProcess({...newProcess, description: e.target.value})}
                    />
                    <p className="text-xs text-gray-400 mt-1">支持使用 <code>{`{{concept}}`}</code> 占位符代表当前脑暴词。</p>
                  </div>
                   {/* Category Selection */}
                   <select 
                        className="w-full border p-2 rounded text-sm bg-white"
                        value={newProcess.category || 'standard'}
                        onChange={e => setNewProcess({...newProcess, category: e.target.value as 'standard' | 'diamond'})}
                  >
                      <option value="standard">标准工艺 (Standard)</option>
                      <option value="diamond">满钻工艺 (Diamond)</option>
                  </select>
                  <div className="flex items-center gap-4">
                     <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden relative"
                      >
                        {newProcess.previewUrl ? (
                          <img src={newProcess.previewUrl} className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <Upload className="w-5 h-5 text-gray-400" />
                            <span className="text-xs text-gray-500 mt-1">上传工艺参考图 / 纹理图</span>
                          </>
                        )}
                        <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'process')} />
                      </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    {editingId && (
                         <button onClick={handleCancelEdit} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">取消</button>
                     )}
                    <button onClick={handleSaveProcess} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2">
                        {editingId ? <><Check className="w-4 h-4"/> 更新工艺</> : '保存工艺'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {library.processes.map(item => (
                  <div key={item.id} className={`p-4 bg-white border rounded-lg relative group ${editingId === item.id ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                    <div className="flex items-start gap-3">
                       <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                         {item.previewUrl && <img src={item.previewUrl} className="w-full h-full object-cover" />}
                       </div>
                       <div className="flex-1">
                         <div className="flex items-center gap-2">
                             <p className="font-medium text-gray-800">{item.name}</p>
                             {item.category === 'diamond' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 rounded font-bold">钻</span>}
                         </div>
                         <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
                       </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded backdrop-blur">
                        <button onClick={() => handleEdit('process', item)} className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => handleDelete(e, 'processes', item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DIAMOND COLORS TAB (UPDATED) */}
          {activeTab === 'diamond' && (
              <div className="max-w-3xl space-y-6">
                  
                  {/* Sub Tab Navigation */}
                  <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                      <button 
                         onClick={() => { setDiamondSubTab('main'); handleCancelEdit(); }}
                         className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${diamondSubTab === 'main' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                          主色库 (Base)
                      </button>
                      <button 
                         onClick={() => { setDiamondSubTab('secondary'); handleCancelEdit(); }}
                         className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${diamondSubTab === 'secondary' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                          副色库 (Pattern)
                      </button>
                  </div>

                  <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}>
                      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          {editingId ? <Edit2 className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4" />}
                          {editingId ? `编辑${diamondSubTab === 'main' ? '主色' : '副色'}` : `添加新${diamondSubTab === 'main' ? '主色' : '副色'}`}
                      </h3>
                      <div className="space-y-4">
                          <input 
                              placeholder="颜色名称 (如: 白钻, 香槟金)" 
                              className="w-full border p-2 rounded text-sm"
                              value={newDiamondColor.name || ''} 
                              onChange={e => setNewDiamondColor({...newDiamondColor, name: e.target.value})}
                          />
                          <div className="flex items-center gap-4">
                              <div 
                                  onClick={() => fileInputRef.current?.click()}
                                  className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden relative"
                              >
                                  {newDiamondColor.previewUrl ? (
                                      <img src={newDiamondColor.previewUrl} className="w-full h-full object-cover" />
                                  ) : (
                                      <>
                                          <Upload className="w-6 h-6 text-gray-400" />
                                          <span className="text-xs text-gray-500 mt-2 text-center">上传贴图<br/>(正方形)</span>
                                      </>
                                  )}
                                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'diamond')} />
                              </div>
                              <div className="flex-1 text-xs text-gray-500">
                                  <p className="font-medium text-gray-700 mb-1">
                                      {diamondSubTab === 'main' ? '主色 (Base Color)' : '副色 (Pattern Color)'}
                                  </p>
                                  <p>上传清晰的水钻材质贴图或颜色参考图。</p>
                                  <p className="mt-1">
                                      {diamondSubTab === 'main' 
                                       ? '用于替换默认的工艺底图，作为手机壳的整体铺底。' 
                                       : '用于生成提示词中的图案颜色描述，如“红钻组成的爱心”。'}
                                  </p>
                              </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                              {editingId && (
                                  <button onClick={handleCancelEdit} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">取消</button>
                              )}
                              <button onClick={handleSaveDiamondColor} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
                                  {editingId ? <><Check className="w-4 h-4"/> 更新颜色</> : '保存颜色'}
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                      {(diamondSubTab === 'main' ? library.mainDiamondColors : library.secondaryDiamondColors)?.map(item => (
                          <div key={item.id} className={`bg-white border rounded-lg overflow-hidden group relative ${editingId === item.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}>
                              <div className="aspect-square bg-gray-100">
                                  <img src={item.previewUrl} className="w-full h-full object-cover" alt={item.name} />
                              </div>
                              <div className="p-3 text-center">
                                  <p className="text-sm font-medium text-gray-800 truncate" title={item.name}>{item.name}</p>
                              </div>
                              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded backdrop-blur p-1">
                                  <button onClick={() => handleEdit('diamond', item)} className="p-1.5 text-white hover:text-blue-300 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                                  <button 
                                      onClick={(e) => handleDelete(e, diamondSubTab === 'main' ? 'mainDiamondColors' : 'secondaryDiamondColors', item.id)} 
                                      className="p-1.5 text-white hover:text-red-300 rounded"
                                  >
                                      <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                          </div>
                      ))}
                      {(!library[diamondSubTab === 'main' ? 'mainDiamondColors' : 'secondaryDiamondColors']?.length) && (
                          <div className="col-span-4 text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-lg">
                              暂无数据，请添加{diamondSubTab === 'main' ? '主色' : '副色'}
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* STYLE TAB */}
          {activeTab === 'style' && (
             <div className="max-w-3xl space-y-8">
               <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200'}`}>
                 <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                     {editingId ? <Edit2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4" />} 
                     {editingId ? '编辑风格' : '添加新风格'}
                 </h3>
                 <div className="space-y-3">
                   <input 
                     placeholder="风格名称 (如: 极简主义)" 
                     className="w-full border p-2 rounded text-sm"
                     value={newStyle.name || ''} 
                     onChange={e => setNewStyle({...newStyle, name: e.target.value})}
                   />
                   <div>
                     <textarea 
                       placeholder="AI 提示词修饰语 (如: minimalist, clean lines, bauhaus style...)" 
                       className="w-full border p-2 rounded text-sm h-20"
                       value={newStyle.promptModifier || ''} 
                       onChange={e => setNewStyle({...newStyle, promptModifier: e.target.value})}
                     />
                     <p className="text-xs text-gray-400 mt-1">支持 <code>{`{{concept}}`}</code> 占位符。</p>
                   </div>
                   <div className="flex items-center gap-4">
                      <div 
                         onClick={() => fileInputRef.current?.click()}
                         className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden relative"
                       >
                         {newStyle.previewUrl ? (
                           <img src={newStyle.previewUrl} className="w-full h-full object-cover" />
                         ) : (
                           <>
                             <Upload className="w-5 h-5 text-gray-400" />
                             <span className="text-xs text-gray-500 mt-1">上传风格参考图</span>
                           </>
                         )}
                         <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'style')} />
                       </div>
                   </div>
                   <div className="flex justify-end gap-2 pt-2">
                     {editingId && (
                          <button onClick={handleCancelEdit} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">取消</button>
                      )}
                     <button onClick={handleSaveStyle} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2">
                         {editingId ? <><Check className="w-4 h-4"/> 更新风格</> : '保存风格'}
                     </button>
                   </div>
                 </div>
               </div>
 
               <div className="grid grid-cols-2 gap-4">
                 {library.styles.map(item => (
                   <div key={item.id} className={`p-4 bg-white border rounded-lg relative group ${editingId === item.id ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                     <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                          {item.previewUrl && <img src={item.previewUrl} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-500 line-clamp-2 font-mono">{item.promptModifier}</p>
                        </div>
                     </div>
                     <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded backdrop-blur">
                         <button onClick={() => handleEdit('style', item)} className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                         <button onClick={(e) => handleDelete(e, 'styles', item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* PROMPTS TAB */}
          {activeTab === 'prompt' && (
              <div className="max-w-4xl space-y-6">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
                      <Activity className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                          <h4 className="text-sm font-bold text-amber-800">Prompt Engineering Zone</h4>
                          <p className="text-xs text-amber-700 mt-1">这里定义了 AI 智能体的核心行为。修改这些提示词将直接影响脑暴质量和生成效果。请谨慎修改。</p>
                      </div>
                  </div>

                  <div className="space-y-6">
                      <div className="bg-white p-5 rounded-lg border border-gray-200">
                          <label className="block text-sm font-bold text-gray-700 mb-2">生成设计图指令 (Design Generation)</label>
                          <textarea 
                              className="w-full h-32 p-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded leading-relaxed focus:border-indigo-500 outline-none"
                              value={localPrompts.designGeneration}
                              onChange={e => setLocalPrompts({...localPrompts, designGeneration: e.target.value})}
                          />
                          <p className="text-[10px] text-gray-400 mt-2">可用变量: <code>{`{{model}}, {{concept}}, {{materialType}}, {{materialColor}}, {{processName}}, {{processDesc}}, {{styleName}}, {{stylePrompt}}, {{context}}`}</code></p>
                      </div>

                      <div className="bg-white p-5 rounded-lg border border-gray-200">
                          <label className="block text-sm font-bold text-gray-700 mb-2">设计师 Agent: 变体生成指令 (Variant Designer)</label>
                          <textarea 
                              className="w-full h-32 p-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded leading-relaxed focus:border-indigo-500 outline-none"
                              value={localPrompts.variantDesigner || ''}
                              onChange={e => setLocalPrompts({...localPrompts, variantDesigner: e.target.value})}
                          />
                          <p className="text-[10px] text-gray-400 mt-2">此指令控制点击“生成变体”按钮时的逻辑。可用变量: <code>{`{{concept}}, {{count}}`}</code></p>
                      </div>

                      <div className="bg-white p-5 rounded-lg border border-gray-200">
                          <label className="block text-sm font-bold text-gray-700 mb-2">脑暴：根节点展开 (Root Expansion)</label>
                          <textarea 
                              className="w-full h-32 p-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded leading-relaxed focus:border-indigo-500 outline-none"
                              value={localPrompts.brainstormRoot}
                              onChange={e => setLocalPrompts({...localPrompts, brainstormRoot: e.target.value})}
                          />
                      </div>
                  </div>

                  <div className="sticky bottom-6 flex justify-end">
                      <button 
                        onClick={handleSavePrompts}
                        className={`px-6 py-3 rounded-lg font-medium text-white shadow-lg flex items-center gap-2 transition-all ${promptSaved ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                      >
                          {promptSaved ? <Check className="w-5 h-5"/> : <Save className="w-5 h-5"/>}
                          {promptSaved ? '已保存设置' : '保存所有提示词'}
                      </button>
                  </div>
              </div>
          )}

          {/* DIAGNOSTIC TAB */}
          {activeTab === 'diagnostic' && (
              <div className="max-w-3xl space-y-6">
                   <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                       <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                           <ShieldCheck className="w-5 h-5 text-indigo-600" /> API 状态检查
                       </h3>
                       <p className="text-sm text-gray-600 mb-6">
                           检测您当前的 API Key 是否有效，以及该 Key 在 Google Cloud / AI Studio 上有权限访问哪些模型。
                           如果您遇到 403 错误，通常是因为未在 GCP Console 中启用 <b>Generative Language API</b>。
                       </p>
                       
                       <button 
                         onClick={handleRunDiagnostics}
                         disabled={diagLoading}
                         className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
                       >
                           {diagLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Activity className="w-4 h-4" />}
                           开始诊断 (Check Models)
                       </button>

                       {diagError && (
                           <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm flex items-start gap-3">
                               <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                               <div>
                                   <p className="font-bold">检测失败</p>
                                   <p>{diagError}</p>
                               </div>
                           </div>
                       )}
                   </div>

                   {diagModels.length > 0 && (
                       <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                           <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
                               <span className="text-xs font-bold text-gray-500 uppercase">Available Models ({diagModels.length})</span>
                               <span className="text-xs text-green-600 font-medium">API Key Active</span>
                           </div>
                           <div className="divide-y divide-gray-100">
                               {diagModels.map((m: any) => {
                                   const isPro = m.name.includes('pro');
                                   const isFlash = m.name.includes('flash');
                                   const isImage = m.name.includes('image') || m.name.includes('vision');
                                   
                                   return (
                                       <div key={m.name} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                           <div>
                                               <div className="flex items-center gap-2">
                                                   <span className="font-mono text-sm font-medium text-gray-900">{m.name.replace('models/', '')}</span>
                                                   {isPro && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded">PRO</span>}
                                                   {isFlash && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">FLASH</span>}
                                               </div>
                                               <p className="text-xs text-gray-500 mt-1">{m.version} · {m.displayName}</p>
                                           </div>
                                           <div className="flex gap-2">
                                                {m.supportedGenerationMethods?.includes('generateContent') && (
                                                    <span className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded border border-green-100">Content</span>
                                                )}
                                                {isImage && (
                                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">Image</span>
                                                )}
                                           </div>
                                       </div>
                                   );
                               })}
                           </div>
                       </div>
                   )}
              </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
