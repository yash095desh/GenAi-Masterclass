// Cot (Chain Of Thought)
import "dotenv/config";
import { OpenAI } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // make sure you set this
});

const client2 = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

async function main() {
  const SYSTEM_PROMPT = `
You are an AI assistant that helps users solve mathematical problems step by step. 
You must strictly use the following step types in order: START → THINK → OUTPUT. 
Do NOT generate EVALUATE steps (those are handled by a separate system). 

Rules:
- Only respond to valid math equations or expressions. Ignore unrelated queries.
- Always reason step by step (multiple THINK steps are allowed across turns).
- ⚠️ IMPORTANT: In each response, you must output exactly ONE JSON object only.
- Each JSON object must strictly follow this format:
  { "step": "START | THINK | OUTPUT", "content": "string" }
- Do NOT output more than one JSON object in a single reply.
- Do NOT include explanations, markdown, or extra text outside the JSON.
`;

  const GEMINI_SYSTEM_PROMPT = `
You are an AI assistant that evaluates reasoning steps of another assistant. 
You will ONLY produce EVALUATE steps.

Rules:
- ⚠️ IMPORTANT: In each response, you must output exactly ONE JSON object only.
- Input will contain START, THINK, and OUTPUT steps.
- After each START or THINK step, you must return ONE evaluation step. 
- Format strictly as JSON:
  { "step": "EVALUATE", "content": "string" }
- Do NOT repeat the reasoning, only comment on correctness/consistency.
- If a mistake is found, clearly describe the error in "content". 
- If correct, return a concise approval such as "Good so far" or "Correct step".
`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "what is the value of 3 * 4 / 7 + 7" },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
    });

    let rawContent = response.choices[0].message.content;
    if (!rawContent) continue;

    // remove markdown fences if any
    rawContent = rawContent.replace(/```json|```/g, "").trim();

    let parsedContent;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch (err) {
      console.error("❌ Failed to parse GPT JSON:", rawContent);
      break;
    }

    messages.push({
      role: "assistant",
      content: JSON.stringify(parsedContent),
    });


    if (parsedContent.step === "START") {
      console.log("🔥", parsedContent.content);
      continue;
    }

    if (parsedContent.step === "THINK") {
      console.log("🧠", parsedContent.content);

      const geminiResponse = await client2.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: GEMINI_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(parsedContent) }, 
        ],
      });

      let evalRaw = geminiResponse.choices[0].message.content;
      if (!evalRaw) continue;

      // Sometimes the response returned is wrapped in ``` fences so for removing them 
      evalRaw = evalRaw.replace(/```json|```/g, "").trim();

      let evaluatedParsedContent;
      try {
        evaluatedParsedContent = JSON.parse(evalRaw);
      } catch (err) {
        console.error("❌ Failed to parse Gemini JSON:", evalRaw);
        break;
      }

      console.log("👩‍⚖️", evaluatedParsedContent.content);

      messages.push({
        role: "user",
        content: JSON.stringify(evaluatedParsedContent),
      });

      continue;
    }

    if (parsedContent.step === "OUTPUT") {
      console.log("🤖", parsedContent.content);
      break;
    }
  }
}

main();
