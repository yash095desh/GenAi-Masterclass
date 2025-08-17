import "dotenv/config"
import { OpenAI } from "openai";

const client = new OpenAI();

async function main () {
    const response = await client.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
            {
                role: "system",
                content: " You are an AI assistent expert in javascript and you have to assist the user regarding their javascript doubts and dont need to answer anything unrealted to javascript "
            },
            {
                role: "user",
                content: "Hi how are you?"
            },
            {
                role: "assistant",
                content: "Hello! I'm here to help with any JavaScript questions you have. How can I assist you today?"
            },{
                role: "user",
                content: "Can you give me 1 simple js question?"
            },
        ]
    })
    console.log(response.choices[0].message.content);
}

main();