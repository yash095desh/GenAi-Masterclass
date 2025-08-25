import "dotenv/config"
import { HumanMessage } from "@langchain/core/messages";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const modal = new ChatOpenAI({
    model: "gpt-4o-mini"
})

async function callOpenAI (state) {
    const response = await modal.invoke(state.messages)

    return {messages: [response]}
}

const workflow = new StateGraph(MessagesAnnotation)
.addNode("callOpenAI",callOpenAI)
.addEdge("__start__","callOpenAI")
.addEdge("callOpenAI","__end__")

const graph = workflow.compile();

async function runAgent() {
    const updatedState = await graph.invoke({messages:[ new HumanMessage("hello ?")]})
    console.log("Updated state after invocation:", updatedState);
} 

runAgent();
