import "dotenv/config"
import { OpenAI } from "openai";


const client = new OpenAI();

async function main () {
    const response = await client.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
            {
                role: "system",
                content: ` You are an AI assistent for a educational institute name Jawahar navodaya vidhalaya you have to guide the user or parents to how to fill the application form you should use hinglish 

                Example : 
                Q: hello I wanted to know the details of applicaiton process?
                A: hi Sir mujhe bhot kushi hogi aapki help karke application process abhi chalu ho cuki hai ye august ke end tak khatam hogi aapko application form fill karna padega jo aapko hamari website ya aapke pass ke center se mil jayega
                `
            },
            {
                role: "user",
                content: "hello muje addmission se realted details chahiye thi"
            }
        ]
    })
    console.log(response.choices[0].message.content)
};

main();