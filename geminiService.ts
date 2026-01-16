
import { GoogleGenAI, Type } from "@google/genai";
import { Category, Employee, Environment, SpecialDay, ScheduleEntry } from "./types";

export const generateScheduleWithAI = async (
  month: string,
  categories: Category[],
  employees: Employee[],
  environments: Environment[],
  specialDays: SpecialDay[]
): Promise<ScheduleEntry[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Você é um especialista em logística de RH. Sua tarefa é gerar uma escala mensal para o mês de ${month}.
    
    OBJETIVO PRINCIPAL:
    - Alternar funcionários. Se um funcionário trabalhou recentemente, ele deve ser a última opção para o próximo dia, priorizando quem NÃO trabalhou ainda ou trabalhou menos vezes no mês.
    
    REGRAS DE OURO:
    1. Respeite os requisitos de cada ambiente (JSON requirements).
    2. Identifique feriados e domingos como dias de escala reduzida ou especial se necessário.
    3. Um funcionário NUNCA pode estar em dois ambientes no mesmo dia.
    4. DISTRIBUIÇÃO JUSTA: A IA deve monitorar o histórico interno da geração para não sobrecarregar ninguém.

    REGRAS PARA FUNCIONÁRIOS COM RESTRIÇÃO (isRestricted: true):
    - Um funcionário com restrição NÃO pode trabalhar sozinho em sua categoria.
    - Se escalar um 'Restricted', você DEVE escalar junto outro funcionário da mesma categoria SEM restrição.
    - Dois funcionários com restrição não podem trabalhar juntos no mesmo ambiente/categoria/dia.
    
    Retorne APENAS um JSON no formato: { "entries": [ { "date": "YYYY-MM-DD", "employeeId": "...", "environmentId": "...", "categoryId": "..." } ] }
  `;

  const prompt = `
    Dados Atuais:
    - Categorias: ${JSON.stringify(categories)}
    - Colaboradores: ${JSON.stringify(employees)}
    - Ambientes: ${JSON.stringify(environments)}
    - Dias Especiais: ${JSON.stringify(specialDays)}
    - Mês Alvo: ${month}

    Gere a escala completa respeitando a alternância para evitar repetições excessivas.
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

    const result = JSON.parse(response.text || '{"entries": []}');
    return result.entries;
  } catch (error) {
    console.error("Erro Gemini:", error);
    throw error;
  }
};
