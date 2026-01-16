
import { GoogleGenAI, Type } from "@google/genai";
import { Category, Employee, Environment, SpecialDay, ScheduleEntry } from "./types";

/**
 * Generates a monthly work schedule using Google Gemini AI.
 * Creates a new instance of GoogleGenAI within the function to ensure it uses
 * the correct API key from the environment.
 */
export const generateScheduleWithAI = async (
  month: string, // YYYY-MM
  categories: Category[],
  employees: Employee[],
  environments: Environment[],
  specialDays: SpecialDay[]
): Promise<ScheduleEntry[]> => {
  // Always use a new instance to ensure the most up-to-date API key is utilized.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Você é um especialista em logística de RH e escalas de trabalho.
    Sua tarefa é gerar uma escala de trabalho mensal para o mês de ${month}.
    
    Regras Fundamentais:
    1. Respeite a quantidade de funcionários por categoria exigida em cada ambiente.
    2. Tente distribuir o trabalho de forma justa. Funcionários não devem trabalhar dias seguidos se houver outros disponíveis.
    3. Identifique feriados e domingos (marcados na lista de SpecialDays).
    4. Retorne APENAS um JSON válido seguindo o esquema fornecido.
    5. Um funcionário não pode ser escalado para dois ambientes no mesmo dia.

    Regras de Restrição (Funcionários com 'isRestricted: true'):
    - Funcionários com restrição NÃO podem ser escalados junto com outro funcionário que também tenha restrição na mesma categoria, ambiente e dia.
    - Um funcionário com restrição NUNCA pode trabalhar sozinho em sua categoria num determinado ambiente e dia. 
    - Se você escalar um funcionário com restrição, deve AUTOMATICAMENTE escalar pelo menos mais um funcionário da mesma categoria (sem restrição) para aquele ambiente/dia, mesmo que o requisito original do ambiente fosse de apenas 1 pessoa.
  `;

  const prompt = `
    Dados:
    Categorias: ${JSON.stringify(categories)}
    Funcionários: ${JSON.stringify(employees)}
    Ambientes e Requisitos: ${JSON.stringify(environments)}
    Dias Especiais (Feriados/Domingos): ${JSON.stringify(specialDays)}
    Mês: ${month}

    Gere a escala para todos os dias do mês. Considere a quantidade de dias no mês ${month}.
  `;

  try {
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
                  date: { type: Type.STRING, description: "YYYY-MM-DD" },
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

    const result = JSON.parse(response.text || '{"entries": []}');
    return result.entries;
  } catch (error) {
    console.error("Erro ao gerar escala via Gemini:", error);
    throw error;
  }
};
