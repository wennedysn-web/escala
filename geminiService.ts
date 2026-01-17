import { GoogleGenAI, Type } from "@google/genai";
import { Category, Employee, Environment, SpecialDay, ScheduleEntry } from "./types";

/**
 * Generates a schedule using the Gemini API.
 */
export const generateScheduleWithAI = async (
  month: string,
  categories: Category[],
  employees: Employee[],
  environments: Environment[],
  specialDays: SpecialDay[],
  providedApiKey?: string,
  history?: ScheduleEntry[]
): Promise<ScheduleEntry[]> => {
  
  // Prioriza a chave provida (ex: do banco de dados) sobre a do ambiente
  const apiKey = providedApiKey || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key não detectada. Por favor, configure-a no banco de dados ou no diálogo.");
  }

  // Inicialização do cliente.
  const ai = new GoogleGenAI({ apiKey });
  
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
    
    4. INTERCALAÇÃO E JUSTIÇA (REGRA DE OURO): 
       - Analise a 'Escala do Mês Anterior' fornecida.
       - Funcionários que trabalharam muitos dias no mês anterior devem ter PRIORIDADE BAIXA para este mês, dando lugar a quem trabalhou menos.
       - Promova uma rotação (intercalação) entre todos os funcionários da mesma categoria para que nenhum seja sobrecarregado consecutivamente.
       
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
    - Escala do Mês Anterior (Para Intercalação): ${JSON.stringify(history || [])}

    Gere a lista de 'entries' equilibrada.
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

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA.");

    const result = JSON.parse(text);
    return result.entries || [];
  } catch (error: any) {
    console.error("Erro Gemini:", error);
    throw new Error(error.message || "Falha ao gerar escala.");
  }
};