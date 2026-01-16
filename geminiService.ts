
import { GoogleGenAI, Type } from "@google/genai";
import { Category, Employee, Environment, SpecialDay, ScheduleEntry } from "./types";

/**
 * Generates a schedule using the Gemini API.
 * The API key is obtained exclusively from the environment variable process.env.API_KEY.
 */
export const generateScheduleWithAI = async (
  month: string,
  categories: Category[],
  employees: Employee[],
  environments: Environment[],
  specialDays: SpecialDay[]
): Promise<ScheduleEntry[]> => {
  
  // Initialization of the Gemini API client using the mandatory named parameter for apiKey.
  // The API key is accessed exclusively via process.env.API_KEY.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const currentMonthDays = specialDays.filter(d => d.date.startsWith(month));

  if (currentMonthDays.length === 0) {
    throw new Error("Não há Domingos ou Feriados cadastrados para este mês nas Configurações.");
  }

  const systemInstruction = `
    Você é um especialista em logística de escalas. Gere uma escala de trabalho APENAS para os dias listados.
    
    REGRAS CRÍTICAS:
    1. Gere escala EXCLUSIVAMENTE para as datas fornecidas na lista de 'Dias Especiais'.
    2. Respeite os requisitos de cada ambiente (quantidade de pessoas por categoria).
    3. Um funcionário não pode estar em dois lugares no mesmo dia.
    4. DISTRIBUIÇÃO JUSTA: Tente não repetir o mesmo funcionário em todos os feriados se houver outros disponíveis da mesma categoria.
    5. RESTRIÇÃO (isRestricted: true): Funcionário restrito NUNCA trabalha sozinho na sua categoria. Precisa de +1 colega da mesma categoria sem restrição no mesmo local.

    RETORNO: JSON puro seguindo o esquema.
  `;

  const prompt = `
    DADOS:
    - Mês Referência: ${month}
    - Dias Especiais (GERAR APENAS PARA ESTES): ${JSON.stringify(currentMonthDays)}
    - Categorias: ${JSON.stringify(categories)}
    - Equipe: ${JSON.stringify(employees)}
    - Ambientes/Postos: ${JSON.stringify(environments)}

    Gere a lista de 'entries'.
  `;

  try {
    // Calling generateContent with the model name, prompt, and system instruction.
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            entries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  employeeId: { type: Type.STRING },
                  environmentId: { type: Type.STRING },
                  categoryId: { type: Type.STRING }
                },
                required: ["date", "employeeId", "environmentId", "categoryId"]
              }
            }
          },
          required: ["entries"]
        }
      }
    });

    // Directly accessing the .text property of GenerateContentResponse.
    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA.");

    const result = JSON.parse(text);
    return result.entries || [];
  } catch (error: any) {
    console.error("Erro Gemini:", error);
    throw new Error(error.message || "Falha ao gerar escala.");
  }
};
