
export interface MaterialOption {
  id: string;
  name: string;
  type: string; // plastic, silicone, etc.
  color: string;
  previewUrl?: string; // Data URL for the base material image
  model: string; // e.g., iPhone 15 Pro
}

export interface ProcessOption {
  id: string;
  name: string;
  description: string;
  previewUrl?: string; // Data URL for texture/effect reference
  category?: 'standard' | 'diamond'; // New field to distinguish process types
}

export interface DiamondColor {
  id: string;
  name: string;
  previewUrl: string; // The image of the diamond texture/color
}

export interface StyleOption {
  id: string;
  name: string;
  promptModifier: string;
  previewUrl?: string; // Data URL for style reference
}

export interface SystemPrompts {
  imageAnalysis: string;
  brainstormRoot: string; // Main instruction for 3-way association (Up/Side/Down)
  brainstormBase?: string; // Base system instruction
  designGeneration: string;
  variantDesigner: string; // New: Agent prompt for redesigning variants
}

export interface Library {
  materials: MaterialOption[];
  processes: ProcessOption[];
  styles: StyleOption[];
  mainDiamondColors: DiamondColor[]; // Separate Main Colors (Base)
  secondaryDiamondColors: DiamondColor[]; // Separate Secondary Colors (Pattern)
  prompts: SystemPrompts;
}

export interface AppSelection {
  materialId: string;
  processId: string;
  styleId: string;
  customSystemPrompt: string;
  mainDiamondColorId?: string; // New selection
  secondaryDiamondColorIds?: string[]; // New selection
}

export interface UsageMetadata {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface CostInfo {
  inputCostUSD: number;
  outputCostUSD: number;
  totalUSD: number;
  totalCNY: number;
}

export interface GenerationMetadata {
  prompt: string;
  referenceImages: {
    label: string;
    mimeType: string;
    data: string; // Base64
  }[];
  model: string;
  usage?: UsageMetadata;
  cost?: CostInfo;
  imageSize?: string;
}

export interface MindMapNode {
  id: string;
  text: string;
  type: 'text' | 'image';
  imageUrl?: string;
  level: number; // 0: Root, 1: Abstract, 2: Concept, 3: Concrete, 4: Design
  children: string[]; // IDs of children
  parentId?: string;
  isLoading?: boolean;
  isSelected?: boolean; // For navigation path
  isMarked?: boolean;   // For batch generation selection
  associationType?: 'up' | 'side' | 'down' | 'root'; // New field for 3-way association
  generationMetadata?: GenerationMetadata;
}

export interface GeneratedDesign {
  id: string;
  imageUrl: string;
  concept: string;
  configSummary: string;
  timestamp: number;
  generationMetadata?: GenerationMetadata;
}
