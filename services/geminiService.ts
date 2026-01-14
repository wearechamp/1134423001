
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGameCommentary = async (
  action: 'throw' | 'win' | 'miss' | 'steal' | 'split' | 'point',
  player: 'X' | 'O',
  board: (string | null)[],
  score?: { X: number; O: number }
): Promise<string> => {
  try {
    const boardState = board.map((cell, i) => `${i}:${cell || '-'}`).join(', ');
    let actionDesc = action.toString();
    if (action === 'steal') actionDesc = 'overwrote the opponent\'s ring to take the spot';
    if (action === 'split') actionDesc = 'randomly triggered a TWIN HOOP and threw two rings';
    if (action === 'point') actionDesc = `scored a point by completing a line of 4! Current score X:${score?.X} O:${score?.O}`;
    if (action === 'win') actionDesc = 'reached 3 points and won the entire match!';
    
    const prompt = `
      You are a snarky, high-energy sports commentator for a futuristic 4x4 Ring Toss game.
      The rules: 4 in a row scores 1 point and clears those rings. First to 3 points wins.
      
      Action: ${actionDesc}
      Current Player: ${player}
      Board State Index (0-15): ${boardState}
      
      Generate a short, punchy (max 15 words) comment in Traditional Chinese (Taiwan).
      Be competitive, witty, and hype up the "score and clear" mechanic. 
      If it's a 'point', act impressed by the line completion.
      If it's a 'win', lose your mind with excitement.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.8,
        maxOutputTokens: 60,
      }
    });

    return response.text?.trim() || "漂亮的分數！";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "積分入袋，漂亮！";
  }
};
