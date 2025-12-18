
import { GoogleGenAI, Type } from "@google/genai";
import { AppSelection, Library, MindMapNode, SystemPrompts, GenerationMetadata, UsageMetadata, CostInfo, GeneratedDesign } from "../types";

// Always create a new instance to ensure the latest API key is used
const getAI = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Resize and Standardize Base64 image
 * Returns standardized mimeType (image/jpeg or image/png) and cleaned base64 data
 */
const resizeImageBase64 = (base64Data: string, inputMimeType: string, maxWidth = 1024): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') { 
            resolve({ data: base64Data, mimeType: inputMimeType }); 
            return; 
        } 
        
        // Sanitize input
        const cleanBase64 = base64Data.replace(/[\r\n]+/g, '');

        // Determine target format: Keep PNG if it is PNG, otherwise normalize to JPEG for consistency and size
        const isPng = inputMimeType.toLowerCase().includes("png");
        const targetMimeType = isPng ? "image/png" : "image/jpeg";
        const quality = 0.85;

        const img = new Image();
        img.crossOrigin = "Anonymous"; // Try to prevent taint issues
        img.src = `data:${inputMimeType};base64,${cleanBase64}`;
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // Resize logic
            if (width > maxWidth || height > maxWidth) {
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxWidth) {
                        width = Math.round(width * (maxWidth / height));
                        height = maxWidth;
                    }
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                // Fill white background for JPEGs to handle transparent PNGs converting to black
                if (targetMimeType === "image/jpeg") {
                    ctx.fillStyle = "#FFFFFF";
                    ctx.fillRect(0, 0, width, height);
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                
                try {
                    const newDataUrl = canvas.toDataURL(targetMimeType, quality); 
                    const matches = newDataUrl.match(/^data:(.+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        resolve({ mimeType: matches[1], data: matches[2] });
                    } else {
                        // Fallback to original if regex fails
                         resolve({ data: cleanBase64, mimeType: inputMimeType });
                    }
                } catch (e) {
                    console.warn("Canvas export failed, using original", e);
                    resolve({ data: cleanBase64, mimeType: inputMimeType });
                }
            } else {
                resolve({ data: cleanBase64, mimeType: inputMimeType });
            }
        };
        
        img.onerror = () => {
            console.warn("Image load failed during resize, using original data");
            resolve({ data: cleanBase64, mimeType: inputMimeType });
        };
    });
};

/**
 * Helper to fetch a URL/Path and return base64 data and mimeType
 */
async function urlToData(url: string): Promise<{ mimeType: string, data: string } | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Normalize MIME type
        let detectedMime = blob.type;
        const lowUrl = url.toLowerCase();
        
        if (!detectedMime || detectedMime === 'application/octet-stream') {
             if (lowUrl.endsWith('.png')) detectedMime = 'image/png';
             else if (lowUrl.endsWith('.jpg') || lowUrl.endsWith('.jpeg')) detectedMime = 'image/jpeg';
             else if (lowUrl.endsWith('.webp')) detectedMime = 'image/webp';
             else detectedMime = 'image/jpeg'; // Fallback default
        }

        // Fix common mistakes like 'image/jpg' which isn't standard
        if (detectedMime === 'image/jpg') detectedMime = 'image/jpeg';

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                 const res = reader.result as string;
                 // Don't trust FileReader's mime prefix blindly if we detected better from URL/Blob
                 const matches = res.match(/^data:(.+);base64,(.+)$/);
                 if (matches && matches.length === 3) {
                     resolve({ mimeType: detectedMime, data: matches[2] });
                 } else {
                     resolve(null);
                 }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn(`Failed to convert asset: ${url}`, e);
        return null;
    }
}

/**
 * Helper for fallback execution
 */
async function withFallback<T>(primaryFn: () => Promise<T>, fallbackFn: () => Promise<T>, operationName: string): Promise<T> {
    try {
        return await primaryFn();
    } catch (error: any) {
        const errorMessage = (error.message || "").toLowerCase();
        
        const isPermissionError = error.status === 403 || errorMessage.includes("403") || errorMessage.includes("permission");
        const isResourceExhausted = error.status === 429 || errorMessage.includes("429");
        const isServerError = error.status === 500 || errorMessage.includes("500") || errorMessage.includes("rpc");
        const isOverloaded = error.status === 503 || errorMessage.includes("503") || errorMessage.includes("overloaded") || errorMessage.includes("unavailable");
        
        // Handle Geo-blocking / Location errors (400 FAILED_PRECONDITION)
        const isLocationError = error.status === 400 && (errorMessage.includes("location") || errorMessage.includes("precondition") || errorMessage.includes("region"));

        if (isPermissionError || isResourceExhausted || isServerError || isOverloaded || isLocationError) {
            console.warn(`[CaseCraft] Primary failed for ${operationName} (${error.status || 'unknown error'}). Switching to fallback.`);
            return await fallbackFn();
        }
        throw error;
    }
}

/**
 * Calculate estimated cost based on Gemini 3 Pro Preview Pricing
 */
const calculateEstCost = (usage: UsageMetadata, modelName: string): CostInfo => {
    // Pricing (Gemini 3 Pro Image Preview)
    // Input: $2.00 / 1M tokens
    // Output: $120.00 / 1M tokens (Approx $0.134 per image)
    const INPUT_PRICE_PER_MILLION = 2.00;
    const OUTPUT_PRICE_PER_MILLION = 120.00;
    const EXCHANGE_RATE = 7.25; // USD to CNY

    const inputCostUSD = (usage.promptTokens / 1_000_000) * INPUT_PRICE_PER_MILLION;
    const outputCostUSD = (usage.candidatesTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
    const totalUSD = inputCostUSD + outputCostUSD;

    return {
        inputCostUSD,
        outputCostUSD,
        totalUSD,
        totalCNY: totalUSD * EXCHANGE_RATE
    };
};

// Interface for the structured response
interface AssociationResponse {
    up: string[];
    side: string[];
    down: string[];
}

/**
 * Generates structured 3-way visual associations for a given word.
 * Returns { up: [], side: [], down: [] }
 */
export const expandBrainstormNode = async (
  node: MindMapNode,
  contextPath: string[],
  prompts: SystemPrompts
): Promise<AssociationResponse> => {
  const taskInstruction = prompts.brainstormRoot;
  const basePrompt = prompts.brainstormBase || "You are an AI visual design assistant.";
  
  // ---------------------------------------------------------------------------
  // CRITICAL FIX: Language & Logic Detection
  // Determine input language to enforce consistency in output language and logic.
  // ---------------------------------------------------------------------------
  const isChinese = /[\u4e00-\u9fa5]/.test(node.text);
  
  const languageContext = isChinese 
      ? `[MANDATORY CONTEXT]
         Current Language: CHINESE (简体中文).
         Output Requirement: MUST be in Simplified Chinese.
         Logic Mode: Concrete Visual Nouns (具体视觉名词). NO adjectives.`
      : `[MANDATORY CONTEXT]
         Current Language: ENGLISH.
         Output Requirement: MUST be in ENGLISH.
         Logic Mode: Slogans, Phrases, Vibes, Short Idioms, Cultural References (Not just objects).`;

  const prompt = `${basePrompt}\n${languageContext}\n\nTarget Word: "${node.text}"\n\nTask Instructions:\n${taskInstruction}`;

  // Configure response schema for Object return
  const requestConfig = {
    responseMimeType: "application/json",
    responseSchema: {
        type: Type.OBJECT,
        properties: {
            up: { type: Type.ARRAY, items: { type: Type.STRING } },
            side: { type: Type.ARRAY, items: { type: Type.STRING } },
            down: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["up", "side", "down"]
    }
  };

  const execute = async (model: string): Promise<AssociationResponse> => {
      const response = await getAI().models.generateContent({
          model, contents: prompt, config: requestConfig
      });
      const text = response.text;
      if (!text) return { up: [], side: [], down: [] };
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText) as AssociationResponse;
  };

  try {
    // Default to flash for brainstorming, fallback to Pro if Flash is overloaded
    return await withFallback(
        () => execute("gemini-2.5-flash"),
        async () => {
             // Add a small delay before fallback to let the system recover or avoid rate limits
             await new Promise(r => setTimeout(r, 1000));
             return execute("gemini-3-pro-preview");
        },
        "Generate Associations"
    );
  } catch (error) {
    console.error("Brainstorm expansion failed:", error);
    return { up: [], side: [], down: [] };
  }
};

/**
 * Generates a phone case image.
 * STRICTLY uses gemini-3-pro-image-preview.
 */
export const generatePhoneCaseDesign = async (
  selection: AppSelection,
  library: Library,
  concept: string,
  fullContextPath: string,
  imageSize: string = "1K"
): Promise<{ imageUrl: string | null; metadata: GenerationMetadata } | null> => {

  const material = library.materials.find(m => m.id === selection.materialId);
  const process = library.processes.find(p => p.id === selection.processId);
  const style = library.styles.find(s => s.id === selection.styleId);

  if (!material || !process) throw new Error("Material and Process are required.");

  let promptText = "";
  const metadataImages: { label: string, mimeType: string, data: string }[] = [];
  const parts: any[] = [];
  
  const attachImagePart = async (urlOrBase64: string, label: string) => {
      let base64Data = "";
      let initialMimeType = "image/png";

      if (urlOrBase64.startsWith('data:')) {
          const matches = urlOrBase64.match(/^data:(.+);base64,(.+)$/);
          if (matches && matches.length === 3) {
              initialMimeType = matches[1];
              base64Data = matches[2];
          }
      } else if (urlOrBase64.trim().length > 0) {
          const result = await urlToData(urlOrBase64);
          if (result) {
              initialMimeType = result.mimeType;
              base64Data = result.data;
          }
      }

      if (base64Data) {
          // IMPORTANT: Resize AND Normalize MIME type to ensure API compatibility
          // This prevents sending PNG data labeled as something else, or using unsupported types
          const { data: resizedData, mimeType: finalMimeType } = await resizeImageBase64(base64Data, initialMimeType, 1024);
          
          parts.push({ inlineData: { mimeType: finalMimeType, data: resizedData } });
          metadataImages.push({ label, mimeType: finalMimeType, data: resizedData });
          console.log(`[CaseCraft] Attached image part (${label}) as ${finalMimeType}`);
      }
  };

  // --- LOGIC FOR DIAMOND PROCESS VS STANDARD PROCESS ---

  if (process.category === 'diamond') {
      // Image 1: Base Material (Always attach first)
      if (material.previewUrl) await attachImagePart(material.previewUrl, "底材参考 (Base Material)");

      // Base Prompt
      promptText = `在图1的手机壳上使用满钻贴钻工艺，手机壳的侧面不贴水钻。在手机壳上加入“${concept}”图案，图形没有线条，“${concept}”图案完全由水钻组成。`;

      // 1. Handle Main Diamond Color (Optional)
      const mainDiamondColor = library.mainDiamondColors?.find(c => c.id === selection.mainDiamondColorId);
      
      // Check if secondary colors are selected
      const secondaryColors = library.secondaryDiamondColors
        ?.filter(c => selection.secondaryDiamondColorIds?.includes(c.id))
        .map(c => c.name) || [];
      const hasSecondary = secondaryColors.length > 0;

      if (mainDiamondColor && mainDiamondColor.previewUrl) {
          // If selected, attach image and add specific prompt
          await attachImagePart(mainDiamondColor.previewUrl, `水钻主色 (Main Diamond - ${mainDiamondColor.name})`);
          
          if (hasSecondary) {
               // Normal logic: Main color matches base, secondary colors match pattern
               promptText += ` 请参考刚传入的“水钻主色”图片作为手机壳的整体背景底色。`;
          } else {
               // Special logic: User wants free pattern colors if secondary is not set
               promptText += ` 请参考刚传入的“水钻主色”图片作为手机壳的**背景底色**。⚠️重要：此颜色仅作为背景（Negative Space），**绝对不要**影响“${concept}”图案本身的配色。由于未指定图案颜色，请你自由发挥，为“${concept}”图案设计鲜明、丰富且美观的颜色，使其与背景形成强烈对比。`;
          }
      }

      // 2. Handle Secondary Diamond Colors (Optional)
      if (hasSecondary) {
          const secondaryColorsStr = secondaryColors.map(c => `“${c}”`).join('、');
          promptText += ` 图案水钻的颜色主要由${secondaryColorsStr}组成。`;
      } 
      // Else: already handled in main color logic (allow free creativity)

      // 3. Handle iPhone 17 Pro specific logic
      if (material.model.toLowerCase().includes('17 pro') || material.model.toLowerCase().includes('17p')) {
          promptText += `。保留图1的“横向贯穿式”设计后置摄像头模组，摄像头不局限于背部左上角，而是一条横跨手机背部上方的矩形凸起区域`;
      }

  } else {
      // --- STANDARD PROCESS LOGIC ---
      
      // Image 1: Base Material
      if (material.previewUrl) await attachImagePart(material.previewUrl, "底材参考 (Base Material)");
      // Image 2: Process Texture
      if (process.previewUrl) await attachImagePart(process.previewUrl, "工艺参考 (Process Texture)");

      const processDesc = process.description.replace(/{{concept}}/g, concept);
      const stylePrompt = (style?.promptModifier || "").replace(/{{concept}}/g, concept);
      
      promptText = library.prompts.designGeneration || "";
      promptText = promptText
        .replace(/{{model}}/g, material.model)
        .replace(/{{concept}}/g, concept)
        .replace(/{{context}}/g, fullContextPath)
        .replace(/{{materialType}}/g, material.type)
        .replace(/{{materialColor}}/g, material.color)
        .replace(/{{processName}}/g, process.name)
        .replace(/{{processDesc}}/g, processDesc)
        .replace(/{{styleName}}/g, style?.name || "Standard Style")
        .replace(/{{stylePrompt}}/g, stylePrompt)
        .replace(/{{customPrompt}}/g, selection.customSystemPrompt ? `Extra Instructions: ${selection.customSystemPrompt}` : "");
  }

  // Push prompt text at the end
  parts.push({ text: promptText });


  // gemini-3-pro-image-preview is required for high quality image generation
  const proModelName = "gemini-3-pro-image-preview";

  const executePro = async (params: { prompt: string, parts: any[] }): Promise<{ imageUrl: string, usage: UsageMetadata } | null> => {
      const config: any = {
        imageConfig: {
            aspectRatio: "9:16",
            imageSize: imageSize // Passed from parameter
        }
      };

      console.log(`[CaseCraft] Calling ${proModelName} with size ${imageSize}...`);
      const ai = getAI(); // Get fresh instance with current key
      const response = await ai.models.generateContent({
        model: proModelName,
        contents: { parts: params.parts },
        config
      });

      // Extract Usage Metadata (or fallback estimates)
      // Preview models might have inconsistent usage metadata return, so we implement fallback
      const usageMeta: UsageMetadata = {
          promptTokens: response.usageMetadata?.promptTokenCount || (params.prompt.length / 4) + (metadataImages.length * 560), // Estimate
          candidatesTokens: response.usageMetadata?.candidatesTokenCount || (imageSize === "4K" ? 2000 : 1120), // Estimate based on size
          totalTokens: response.usageMetadata?.totalTokenCount || 0
      };
      if (usageMeta.totalTokens === 0) usageMeta.totalTokens = usageMeta.promptTokens + usageMeta.candidatesTokens;

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return {
                imageUrl: `data:image/png;base64,${part.inlineData.data}`,
                usage: usageMeta
            };
          }
        }
      }
      return null;
  };

  try {
      // Retry logic only (no model fallback for pro image generation)
      let result;
      try {
          result = await executePro({ prompt: promptText, parts });
      } catch (e: any) {
          console.warn(`[CaseCraft] First attempt at ${proModelName} failed (${e.message}), retrying in 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          result = await executePro({ prompt: promptText, parts });
      }

      if (result && result.imageUrl) {
        const costInfo = calculateEstCost(result.usage, proModelName);
        
        return {
            imageUrl: result.imageUrl,
            metadata: {
                prompt: promptText,
                referenceImages: metadataImages,
                model: proModelName,
                usage: result.usage,
                cost: costInfo
            }
        };
      }
      return null;

  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
};

/**
 * Generates variants of an existing design.
 * 1. Uses a Text Agent to rewrite prompts based on the original.
 * 2. Uses Image Model to render variants.
 */
export const generateDesignVariants = async (
  originalDesign: GeneratedDesign,
  count: number,
  prompts: SystemPrompts
): Promise<GeneratedDesign[]> => {
    const originalMeta = originalDesign.generationMetadata;
    if (!originalMeta) throw new Error("Missing metadata for variant generation");

    // Step 1: Generate New Prompts using Text Agent
    const agentPrompt = prompts.variantDesigner
        .replace(/{{concept}}/g, originalDesign.concept)
        .replace(/{{count}}/g, count.toString());

    const textInput = `Original Prompt: "${originalMeta.prompt}"\n\nTask: Generate ${count} variants based on the system instructions.`;
    
    console.log("[CaseCraft] Generating variant prompts...");
    const ai = getAI();
    const promptResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: textInput }] }],
        config: {
            systemInstruction: agentPrompt,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });

    let newPrompts: string[] = [];
    try {
        const text = promptResponse.text;
        if (text) {
             newPrompts = JSON.parse(text);
        }
    } catch (e) {
        console.error("Failed to parse variant prompts", e);
        // Fallback: Just use original prompt
        newPrompts = Array(count).fill(originalMeta.prompt + " (Variant)");
    }

    // Step 2: Generate Images for each prompt
    const proModelName = "gemini-3-pro-image-preview";
    const imageSize = originalMeta.imageSize || "1K";
    const generatedVariants: GeneratedDesign[] = [];

    // Reconstruct parts: Images first, then new prompt text
    const baseParts: any[] = [];
    // Reuse reference images from original metadata
    if (originalMeta.referenceImages) {
        for (const img of originalMeta.referenceImages) {
             baseParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        }
    }

    const tasks = newPrompts.slice(0, count).map(async (newPrompt, idx) => {
        const parts = [...baseParts, { text: newPrompt }];
        
        try {
            console.log(`[CaseCraft] Generating variant image ${idx + 1}/${count}...`);
            const response = await ai.models.generateContent({
                model: proModelName,
                contents: { parts },
                config: {
                    imageConfig: {
                        aspectRatio: "9:16",
                        imageSize: imageSize
                    }
                }
            });

            // Extract Result
            if (response.candidates && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        
                        // Metadata for the new variant
                        const usageMeta: UsageMetadata = {
                            promptTokens: response.usageMetadata?.promptTokenCount || 0,
                            candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
                            totalTokens: response.usageMetadata?.totalTokenCount || 0
                        };
                        const costInfo = calculateEstCost(usageMeta, proModelName);

                        const variantDesign: GeneratedDesign = {
                            id: `${originalDesign.id}-var-${idx}-${Date.now()}`,
                            imageUrl: `data:image/png;base64,${part.inlineData.data}`,
                            concept: `${originalDesign.concept} (Var ${idx + 1})`,
                            configSummary: originalDesign.configSummary, // Inherit config name
                            timestamp: Date.now(),
                            generationMetadata: {
                                prompt: newPrompt,
                                referenceImages: originalMeta.referenceImages, // Inherit refs
                                model: proModelName,
                                usage: usageMeta,
                                cost: costInfo,
                                imageSize: imageSize
                            }
                        };
                        return variantDesign;
                    }
                }
            }
        } catch (e) {
            console.error(`Variant ${idx} generation failed`, e);
        }
        return null;
    });

    const results = await Promise.all(tasks);
    return results.filter(r => r !== null) as GeneratedDesign[];
};

export const analyzeStartImage = async (imageBase64: string, prompts: SystemPrompts): Promise<string> => {
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    // Normalize analysis image to JPEG to be safe
    const { data: resizedData, mimeType } = await resizeImageBase64(base64Data, "image/png", 800);
    
    const execute = async (model: string) => {
        const response = await getAI().models.generateContent({
            model,
            contents: {
                parts: [
                    { inlineData: { mimeType, data: resizedData } },
                    { text: prompts.imageAnalysis }
                ]
            }
        });
        return response.text?.trim() || "艺术设计";
    };
    try {
        return await withFallback(
            () => execute("gemini-2.5-flash"),
            async () => {
                await new Promise(r => setTimeout(r, 1000));
                return execute("gemini-3-pro-preview");
            },
            "Analyze Image"
        );
    } catch (e) {
        return "创意设计";
    }
}

/**
 * Diagnostics: List available models for the current API Key
 * Note: This uses the REST API directly for diagnostics as the SDK 
 * focuses on generation. This helps verify key permissions.
 */
export const listGeminiModels = async (): Promise<any[]> => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            let errorMsg = `API Error (${response.status})`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMsg = errorData.error.message || `Code: ${errorData.error.code}`;
                }
                
                if (response.status === 403) {
                     errorMsg = "权限被拒绝 (403)。如果您使用 Google Cloud API Key，请确保已在 GCP 控制台中启用 'Generative Language API'。";
                }
            } catch (e) {
                const text = await response.text();
                if (text) errorMsg += `: ${text}`;
            }
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        return data.models || [];
    } catch (e: any) {
        console.error("Failed to list models", e);
        throw e;
    }
};
