
import React from 'react';
import { AppSelection, Library } from '../types';
import { ChevronLeft, ChevronRight, Settings2, Gem, Check } from 'lucide-react';

interface ConfigPanelProps {
  library: Library;
  selection: AppSelection;
  setSelection: React.Dispatch<React.SetStateAction<AppSelection>>;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ library, selection, setSelection, isCollapsed, toggleCollapse }) => {
  const selectedMaterial = library.materials.find(m => m.id === selection.materialId);
  const selectedProcess = library.processes.find(p => p.id === selection.processId);
  const selectedStyle = library.styles.find(s => s.id === selection.styleId);

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

  if (isCollapsed) {
      return (
          <div className="w-12 border-r border-gray-200 bg-white flex flex-col items-center py-4 z-20">
              <button onClick={toggleCollapse} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                  <ChevronRight className="w-5 h-5" />
              </button>
              <div className="mt-8 flex flex-col gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold" title={selectedMaterial?.name}>
                      M
                  </div>
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold" title={selectedProcess?.name}>
                      P
                  </div>
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold" title={selectedStyle?.name || '无'}>
                      S
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="bg-white border-r border-gray-200 w-80 flex flex-col h-full overflow-y-auto no-scrollbar shadow-xl z-20 relative">
      <button 
        onClick={toggleCollapse}
        className="absolute top-2 right-2 p-1.5 hover:bg-gray-100 rounded text-gray-400"
      >
          <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="p-6 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-indigo-600" />
          当前设计配置
        </h2>
        <p className="text-xs text-gray-500 mt-1">配置底材与工艺，用于生成效果图</p>
      </div>

      <div className="p-6 space-y-8">
        {/* Material Selector */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">手机壳底材</h3>
          <div className="space-y-2">
             <select 
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 outline-none focus:border-indigo-500"
                value={selection.materialId}
                onChange={(e) => setSelection({...selection, materialId: e.target.value})}
             >
                 {library.materials.map(m => (
                     <option key={m.id} value={m.id}>{m.name} ({m.model})</option>
                 ))}
             </select>
             {selectedMaterial && (
                 <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded relative group overflow-hidden">
                     <div className="mb-2">
                        {selectedMaterial.type} · {selectedMaterial.color}
                     </div>
                     {selectedMaterial.previewUrl && (
                         <img src={selectedMaterial.previewUrl} className="w-full h-32 object-contain bg-white border rounded" alt="Base" />
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
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 outline-none focus:border-indigo-500"
                value={selection.processId}
                onChange={(e) => setSelection({...selection, processId: e.target.value})}
             >
                 {library.processes.map(p => (
                     <option key={p.id} value={p.id}>{p.name}</option>
                 ))}
             </select>
             {selectedProcess && (
                 <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
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
                                    ${selection.mainDiamondColorId === dc.id ? 'border-indigo-600 scale-105 shadow-md' : 'border-gray-200 opacity-70 hover:opacity-100'}
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
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase">水钻副色 (图案配色 - 可多选)</h4>
                    <div className="grid grid-cols-4 gap-2">
                        {library.secondaryDiamondColors?.map(dc => {
                            const isSelected = selection.secondaryDiamondColorIds?.includes(dc.id);
                            return (
                                <button
                                    key={dc.id}
                                    onClick={() => toggleSecondaryColor(dc.id)}
                                    className={`
                                        relative aspect-square rounded-lg overflow-hidden border transition-all group
                                        ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-gray-200'}
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
                className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50 outline-none focus:border-indigo-500"
                value={selection.styleId}
                onChange={(e) => setSelection({...selection, styleId: e.target.value})}
             >
                 <option value="">无风格 (使用模型默认)</option>
                 {library.styles.map(s => (
                     <option key={s.id} value={s.id}>{s.name}</option>
                 ))}
             </select>
             {selectedStyle && (
                 <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                     <div className="mb-2 font-mono text-[10px] opacity-70 truncate" title={selectedStyle.promptModifier}>{selectedStyle.promptModifier}</div>
                     {selectedStyle.previewUrl && (
                         <img src={selectedStyle.previewUrl} className="w-full h-24 object-cover rounded" alt="Style" />
                     )}
                 </div>
             )}
          </div>
        </div>

        {/* System Prompt */}
        <div className="space-y-3 pb-8">
           <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">系统提示词 (Prompt)</h3>
           <textarea 
             placeholder="输入额外的全局AI绘画指令..."
             className="w-full p-2 border border-gray-200 rounded-lg text-xs h-24 text-gray-600 resize-none outline-none focus:border-indigo-500"
             value={selection.customSystemPrompt}
             onChange={(e) => setSelection({...selection, customSystemPrompt: e.target.value})}
           />
        </div>

      </div>
    </div>
  );
};

export default ConfigPanel;
