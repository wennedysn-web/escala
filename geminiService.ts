
import { GoogleGenAI, Type } from "@google/genai";
import { Category, Employee, Environment, SpecialDay, ScheduleEntry } from "./types";

export const generateScheduleWithAI = async (
  month: string,
  categories: Category[],
  employees: Employee[],
  environments: Environment[],
  specialDays: SpecialDay[]
): Promise<ScheduleEntry[]> => {
  if (!process.env.API_KEY) {
    throw new Error("A chave de API não foi detectada no ambiente.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    Você é um especialista sênior em logística de RH. Sua tarefa é gerar uma escala mensal para o mês de ${month}.
    
    DIRETRIZES DE ESCALA:
    1. DISTRIBUIÇÃO EQUITATIVA: Alterne os funcionários para que todos trabalhem aproximadamente a mesma quantidade de dias.
    2. REQUISITOS DE AMBIENTE: Respeite rigorosamente a quantidade de pessoas por categoria definida no JSON de cada ambiente.
    3. EXCLUSIVIDADE: Um funcionário não pode estar em dois lugares no mesmo dia.
    4. RESTRIÇÕES DE SEGURANÇA (isRestricted: true): Funcionários marcados como restritos NUNCA podem trabalhar sozinhos em sua categoria num ambiente. Eles precisam de pelo menos um colega da mesma categoria sem restrição no mesmo local e dia.
    5. FERIADOS E DOMINGOS: Trate os dias marcados em 'specialDays' com atenção, mantendo a escala conforme os requisitos do ambiente.

    FORMATO DE SAÍDA:
    Retorne estritamente um JSON válido seguindo o esquema fornecido. Não inclua explicações ou markdown.
  `;

  const prompt = `
    DADOS PARA PROCESSAMENTO:
    - Mês: ${month}
    - Categorias Disponíveis: ${JSON.stringify(categories)}
    - Lista de Funcionários: ${JSON.stringify(employees)}
    - Postos de Trabalho: ${JSON.stringify(environments)}
    - Dias Especiais/Feriados: ${JSON.stringify(specialDays)}

    Gere a escala completa para todos os dias do mês ${month}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
                  date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
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

    const text = response.text;
    if (!text) {
      throw new Error("A IA retornou uma resposta vazia. Verifique sua cota ou conexão.");
    }

    const result = JSON.parse(text);
    if (!result.entries || !Array.isArray(result.entries)) {
      throw new Error("O formato dos dados gerados pela IA é inválido.");
    }

    return result.entries;
  } catch (error: any) {
    console.error("Erro detalhado do Gemini:", error);
    
    if (error.message?.includes("API_KEY_INVALID")) {
      throw new Error("Chave de API inválida ou expirada.");
    }
    
    if (error.message?.includes("429")) {
      throw new Error("Limite de requisições da IA atingido. Aguarde um minuto.");
    }

    throw new Error(error.message || "Falha inesperada ao processar a escala.");
  }
};
