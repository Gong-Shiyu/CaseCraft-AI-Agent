
import React, { useState, useEffect } from 'react';
import ConfigPanel from './components/ConfigPanel';
import BrainstormCanvas from './components/BrainstormCanvas';
import SettingsPage from './components/SettingsPage';
import DesignGenerator from './components/DesignGenerator';
import { AppSelection, Library, MindMapNode, DiamondColor } from './types';
import { loadLibraryFromDB, saveLibraryToDB } from './services/db';
import { Layers, Zap, Settings, LayoutGrid, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

const DEFAULT_PROMPTS = {
    imageAnalysis: "分析这张图片，用中文提供一个简短的词语（1-3个词）来概括其核心视觉主题或对象。这将作为头脑风暴的种子词。",
    // Updated prompt: Strongly enforces language-specific logic paths.
    brainstormRoot: `你是一个设计灵感联想引擎。请根据用户输入的核心词，输出JSON对象 { "up": [], "side": [], "down": [] }。

**1. 语言与逻辑一致性规则 (CRITICAL)**:
- **当输入是中文时**: 输出必须是**中文**。逻辑模式 = **具象视觉名词** (Visual Nouns)。
- **当输入是英文时**: 输出必须是**英文**。逻辑模式 = **口号、梗、氛围感、态度** (Slogans, Phrases, Vibes). **DO NOT output simple nouns.**

**2. 联想维度**:

*   **Up (上级)** [3-4个]:
    *   CN: 归属类别、宏观风格 (e.g. "水果", "赛博朋克").
    *   EN: Core Concept, Broad Theme (e.g. "Rebellion", "Healthy Life").

*   **Side (同级)** [6-9个]:
    *   CN: 强相关意象、相似物、CP组合 (e.g. "胡萝卜", "月球").
    *   EN: Synonyms, Related Slang, Contextual Phrases (e.g. "Bunny Hop", "Carrot Lover", "Easter").

*   **Down (下级/变体)** [3-5个]:
    *   **CN 逻辑 (Visual Nouns)**: 特定形态、视觉变体、文化符号。
        - ❌ 禁止: 肢体部位 (尾巴, 耳朵, 爪子).
        - ✅ 示例: 苹果 -> [苹果切面, 青苹果, 毒苹果, 糖葫芦].
        
    *   **EN 逻辑 (Slogans & Vibes)**: **Specific Phrases, Attitudes, Text Graphic Ideas, Cultural Memes.**
        - ❌ Ban: Simple nouns (e.g., "Apple", "Stem").
        - ✅ Examples:
            - "Rabbit" -> ["Don't Touch My Ears", "Hop Fast", "Bad Bunny", "Fluffy Logic"]
            - "Coffee" -> ["Monday Mood", "Caffeine Loading", "Espresso Yourself"]

**Strict JSON Output only.**`,
    
    brainstormBase: `You are an AI visual design assistant. Output strict JSON object with keys: up, side, down. Follow language-specific constraints.`,
    designGeneration: `电商白底手机壳背面产品图，在图1的手机壳上使用图2的工艺{{processName}}，保持手机壳镂空的孔位完全和图1一致 ，加入{{concept}}，{{processDesc}}。风格是{{styleName}} ({{stylePrompt}})`,
    variantDesigner: `你是一位高级手机壳设计师。你的任务是基于原有的“设计提示词”，针对核心概念 {{concept}} 设计 {{count}} 个全新的变体方案。

**严格约束 (Constraints):**
1.  **保留背景与工艺**: 必须保留原提示词中关于“手机壳材质”、“背景颜色”、“底色”和“工艺类型 (如满钻、浮雕、镭雕)”的描述。不要改变这些物理属性。
2.  **重构图案**: 彻底重新设计关于 {{concept}} 的视觉表现。
    *   **布局变化**: 尝试不同的构图（如：单个大图居中、满版重复排列、对角线构图、边框式构图）。
    *   **颜色变化**: 为图案（非背景）尝试全新的配色方案，确保与背景形成美观的对比。
    *   **风格微调**: 在保持原工艺前提下，尝试不同的艺术风格（如：更抽象、更写实、像素化、线条化）。

**Output Format:**
返回一个 JSON 字符串数组 (Array of Strings)，包含 {{count}} 个完整的、可直接用于绘画的 Prompt。不要包含 JSON 以外的任何解释性文字。`
};

// Mock assets for diamond colors
const DEFAULT_MAIN_DIAMOND_COLORS: DiamondColor[] = [
    { id: 'dc_white', name: '白钻 (White)', previewUrl: 'assets/p4.png' },
    { id: 'dc_pink', name: '粉钻 (Pink)', previewUrl: 'assets/m3.png' },
    { id: 'dc_black', name: '黑钻 (Black)', previewUrl: 'assets/m2.png' },
];

const DEFAULT_SECONDARY_DIAMOND_COLORS: DiamondColor[] = [
    { id: 'dc_blue', name: '浅蓝 (Sapphire)', previewUrl: 'assets/p3.png' },
    { id: 'dc_champagne', name: '金黄水晶 (Lt.Topaz)', previewUrl: 'assets/p2.png' },
    { id: 'dc_red', name: '大红 (Siam)', previewUrl: 'assets/s2.png' },
    { id: 'dc_yellow', name: '金黄 (Topaz)', previewUrl: 'assets/s4.png' },
];

export const DEFAULT_LIBRARY: Library = {
  materials: [
      { id: 'm1', name: '透明防摔壳', type: 'shockproof', color: 'Transparent', model: 'iPhone 15 Pro', previewUrl: 'assets/m1.png' },
      { id: 'm2', name: '黑色磨砂硅胶', type: 'silicone', color: 'Black Matte', model: 'iPhone 15 Pro', previewUrl: 'assets/m2.png' },
      { id: 'm3', name: '粉色', type: 'plastic', color: 'pink', model: 'iPhone 17 Pro', previewUrl: 'assets/img_PhoneCase/粉色17p.png' },
  ],
  processes: [
      { id: 'p1', name: '高清彩印', description: '高精度数码打印，{{concept}}色彩还原度高', previewUrl: 'assets/p1.png', category: 'standard' },
      { id: 'p2', name: '3D浮雕', description: '表面有明显的凹凸质感，{{concept}}呈现立体浮雕效果，触感丰富', previewUrl: 'assets/p2.png', category: 'standard' },
      { id: 'p3', name: '激光镭雕', description: '金属或特殊涂层的蚀刻效果，{{concept}}呈现银灰色纹理', previewUrl: 'assets/p3.png', category: 'standard' },
      { id: 'p4', name: '满钻工艺', description: '手机壳背面贴满水钻，图形没有线条，{{concept}}图案完全由水钻组成。手机壳的侧面和摄像头模组内部不贴水钻', previewUrl: 'assets/img_Process/001.png', category: 'diamond' },
  ],
  styles: [
      { id: 's1', name: '极简现代', promptModifier: 'minimalist, clean lines, apple aesthetic, bauhaus', previewUrl: 'assets/s1.png' },
      { id: 's2', name: '赛博朋克', promptModifier: 'cyberpunk, neon lights, futuristic, high tech, mechanical parts', previewUrl: 'assets/s2.png' },
      { id: 's3', name: '油画质感', promptModifier: 'impasto oil painting style, expressive brushstrokes, van gogh style', previewUrl: 'assets/s3.png' },
      { id: 's4', name: '可爱插画', promptModifier: 'cute vector illustration, pastel colors, soft edges, doodle style', previewUrl: 'assets/s4.png' },
  ],
  mainDiamondColors: DEFAULT_MAIN_DIAMOND_COLORS,
  secondaryDiamondColors: DEFAULT_SECONDARY_DIAMOND_COLORS,
  prompts: DEFAULT_PROMPTS
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'brainstorm' | 'studio' | 'settings'>('brainstorm');
  
  // API Key State
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
           // @ts-ignore
           const has = await window.aistudio.hasSelectedApiKey();
           setHasApiKey(has);
        } else {
           // Fallback for non-AIStudio environments
           setHasApiKey(true);
        }
      } catch (e) {
        console.error("Error checking API key:", e);
        setHasApiKey(false);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio) {
      try {
          // @ts-ignore
          await window.aistudio.openSelectKey();
          setHasApiKey(true); // Assume success to mitigate race condition
      } catch (e) {
          console.error("Key selection failed:", e);
      }
    }
  };

  // Library State
  const [library, setLibrary] = useState<Library>(DEFAULT_LIBRARY);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      const saved = await loadLibraryFromDB();
      if (saved) {
         setLibrary(prev => ({ 
             ...prev, 
             ...saved,
             prompts: { ...prev.prompts, ...saved.prompts },
             // Ensure new fields exist if loading old data
             mainDiamondColors: saved.mainDiamondColors || DEFAULT_MAIN_DIAMOND_COLORS,
             secondaryDiamondColors: saved.secondaryDiamondColors || DEFAULT_SECONDARY_DIAMOND_COLORS
         }));
      }
      setDbLoaded(true);
    };
    loadData();
  }, []);

  // Save to IndexedDB
  useEffect(() => {
    if (dbLoaded) {
      saveLibraryToDB(library);
    }
  }, [library, dbLoaded]);

  // Current User Selection
  const [selection, setSelection] = useState<AppSelection>({
      materialId: 'm1',
      processId: 'p1',
      styleId: 's1',
      customSystemPrompt: '',
      mainDiamondColorId: undefined, // Default unselected
      secondaryDiamondColorIds: []
  });

  const [nodes, setNodes] = useState<MindMapNode[]>([]);

  // Filter marked nodes for the studio
  const markedNodes = nodes.filter(n => n.isMarked);

  // Render Loading / Auth Screen
  if (isCheckingKey) {
      return (
          <div className="h-screen flex items-center justify-center bg-white">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600"/>
          </div>
      );
  }

  if (!hasApiKey) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-center p-6">
              <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-indigo-200 animate-in zoom-in duration-500">
                  <ShieldCheck className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">CaseCraft AI Studio</h1>
              <p className="text-gray-500 max-w-md mb-8 leading-relaxed">
                  需要使用 <b>Gemini 3.0 Pro</b> 模型生成高精度手机壳设计图。
                  <br/>请连接您的 Google Cloud 付费项目 API Key 以继续。
              </p>
              <button 
                  onClick={handleSelectKey}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-3 active:scale-95"
              >
                  连接 API Key <ArrowRight className="w-5 h-5" />
              </button>
              <p className="mt-8 text-xs text-gray-400">
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-indigo-600 transition-colors">
                      了解关于 Gemini API 计费
                  </a>
              </p>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar Navigation */}
      <div className="w-16 bg-gray-900 flex flex-col items-center py-6 gap-6 text-gray-400 z-30 shrink-0">
        <div className="text-white p-2 bg-indigo-600 rounded-xl mb-4">
          <Layers className="w-6 h-6" />
        </div>
        
        <button 
          onClick={() => setActiveTab('brainstorm')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'brainstorm' ? 'bg-gray-800 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-gray-800 hover:text-gray-200'}`}
          title="词语关联器 (Associator)"
        >
          <Zap className="w-6 h-6" />
        </button>

        <button 
          onClick={() => setActiveTab('studio')}
          className={`p-3 rounded-xl transition-all relative ${activeTab === 'studio' ? 'bg-gray-800 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-gray-800 hover:text-gray-200'}`}
          title="设计工坊 (Studio)"
        >
          <LayoutGrid className="w-6 h-6" />
          {markedNodes.length > 0 && (
             <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-gray-900"></span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab('settings')}
          className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-gray-800 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-gray-800 hover:text-gray-200'}`}
          title="系统设置 (Settings)"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 h-full overflow-hidden relative">
        
        {/* VIEW: BRAINSTORM */}
        <div className={`absolute inset-0 flex transition-opacity duration-300 ${activeTab === 'brainstorm' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             {/* Canvas Only - ConfigPanel removed */}
             <BrainstormCanvas 
                nodes={nodes} 
                setNodes={setNodes}
                selection={selection}
                library={library}
                onNavigateToStudio={() => setActiveTab('studio')}
             />
        </div>

        {/* VIEW: STUDIO */}
        <div className={`absolute inset-0 bg-white transition-opacity duration-300 ${activeTab === 'studio' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             {/* Integrated Configuration & Generation */}
             <DesignGenerator 
                selectedNodes={markedNodes}
                selection={selection}
                setSelection={setSelection}
                library={library}
             />
        </div>

        {/* VIEW: SETTINGS */}
        <div className={`absolute inset-0 bg-white transition-opacity duration-300 ${activeTab === 'settings' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             <SettingsPage library={library} setLibrary={setLibrary} />
        </div>
          
      </div>
    </div>
  );
};

export default App;
