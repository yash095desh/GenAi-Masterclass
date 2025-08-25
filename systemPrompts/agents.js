import "dotenv/config";
import { OpenAI } from "openai";
import fs from "fs/promises";
import fssync from "fs"; // for sync ops
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import axios from "axios";
import express from "express";
import { exec } from "child_process";
import { JSDOM } from "jsdom";
import archiver from "archiver";

// Needed for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new OpenAI();

// -------- Core Tools -------- //
export async function clone_dynamic(url, outDir) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  const html = await page.content();
  await browser.close();

  if (!fssync.existsSync(outDir)) fssync.mkdirSync(outDir, { recursive: true });
  fssync.writeFileSync(path.join(outDir, "raw.html"), html, "utf-8");

  return html;
}

export function extract_links(html, baseUrl) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const abs = (link) => new URL(link, baseUrl).href;

  return {
    scripts: [...document.querySelectorAll("script[src]")].map((s) => abs(s.src)),
    stylesheets: [...document.querySelectorAll("link[rel='stylesheet']")].map((l) => abs(l.href)),
    images: [...document.querySelectorAll("img[src]")].map((i) => abs(i.src)),
    pages: [...document.querySelectorAll("a[href]")].map((a) => abs(a.href)),
  };
}

export async function download_asset(url, outDir) {
  const parsed = new URL(url);
  const filePath = path.join(outDir, parsed.pathname);
  fssync.mkdirSync(path.dirname(filePath), { recursive: true });

  const response = await axios.get(url, { responseType: "arraybuffer" });
  fssync.writeFileSync(filePath, response.data);

  return filePath;
}

export function rewrite_html(html, mapping) {
  let newHtml = html;
  for (const [remote, local] of Object.entries(mapping)) {
    newHtml = newHtml.replaceAll(remote, local);
  }
  return newHtml;
}

export function save_html(html, outDir) {
  const filePath = path.join(outDir, "index.html");
  fssync.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

export function start_server(outDir, port = 3000) {
  const app = express();
  app.use(express.static(outDir));
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
  return `🚀 Server running at http://localhost:${port}`;
}

// -------- FS Tools -------- //
export async function list_files(dir) {
  return (await fs.readdir(dir)).join("\n");
}
export function read_file(filePath) {
  if (!fssync.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fssync.readFileSync(filePath, "utf-8");
}
export async function write_file(path_, content) {
  await fs.writeFile(path_, content, "utf-8");
  return `✍️ File written: ${path_}`;
}
export async function delete_file(path_) {
  await fs.unlink(path_);
  return `🗑️ File deleted: ${path_}`;
}
export async function copy_file(src, dest) {
  await fs.copyFile(src, dest);
  return `📄 Copied ${src} -> ${dest}`;
}
export async function move_file(src, dest) {
  await fs.rename(src, dest);
  return `📂 Moved ${src} -> ${dest}`;
}

// -------- Packaging -------- //
export async function zip_dir(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fssync.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve(`📦 Zipped -> ${outPath}`));
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// -------- Safe Shell Exec -------- //
export function run_shell(command) {
  const whitelist = ["ls", "pwd", "echo"];
  if (!whitelist.includes(command.split(" ")[0])) {
    throw new Error("🚫 Command not allowed");
  }
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout || stderr);
    });
  });
}

export const TOOL_MAP = {
  clone_dynamic,
  extract_links,
  download_asset,
  rewrite_html,
  save_html,
  start_server,
  list_files,
  read_file,
  write_file,
  delete_file,
  copy_file,
  move_file,
  zip_dir,
  run_shell,
};

// -------- Main Execution Flow -------- //
async function main() {
    const SYSTEM_PROMPT = `
    You are an AI assistant that works on START , THINK and OUTPUT format.
    For a query given by user you need to breakdown it into sub problems.
    You should always keep thinking and thinking before giving an output.

    Also before providing the output you must check is everything correct.
    You also have a list of tools you can call based on user query.

    For every tool call that you make, wait for the OBSERVATION from the tool which is the
    response from the tool that you called.

    You can call the following tools:

    // -------- Core Tools -------- //
    - clone_dynamic(url: string, outDir: string): Uses Puppeteer to render a dynamic website and saves the raw HTML in outDir.
    - extract_links(html: string, baseUrl: string): Parses HTML to extract scripts, stylesheets, images, and internal links.
    - download_asset(url: string, outDir: string): Downloads an asset (CSS, JS, image, etc.) and saves to outDir.
    - rewrite_html(html: string, mapping: object): Replaces remote asset URLs with local file paths.
    - save_html(html: string, outDir: string): Saves given HTML into index.html at outDir.
    - start_server(outDir: string, port: number): Starts an Express static server to serve the cloned site locally.

    // -------- FS Tools -------- //
    - list_files(dir: string): Lists files in a directory.
    - read_file(path: string): Reads the content of a file.
    - write_file(path: string, content: string): Writes/overwrites content into a file.
    - delete_file(path: string): Deletes the specified file.
    - copy_file(src: string, dest: string): Copies a file.
    - move_file(src: string, dest: string): Moves or renames a file.

    // -------- Packaging & Preview -------- //
    - zip_dir(sourceDir: string, outPath: string): Zips a directory into a file.

    // -------- Safe Shell Exec -------- //
    - run_shell(command: string): Runs a whitelisted shell command (ls, pwd, echo).

        Rules for responding:

        Strictly very very important you just have to send each step at a time as output in sequence 

        1. JSON-Only Response:
        - You must respond **strictly and only** in JSON format.
        - Do **NOT** include explanations, markdown, code fences, or any text outside of JSON.
        - The JSON object must always follow this structure:
            {
            "step": "START | THINK | TOOL | OBSERVE | OUTPUT",
            "content": "string describing the step",
            "tool_name": "string with tool name or null if not applicable",
            "input": "stringified JSON input for the tool or null if not applicable"
            }

        2. Single-Step Per Response:
        - Each message must contain **exactly one JSON object** means you should only return next output as a single step.
        - Do not combine multiple steps (e.g., THINK + TOOL) in a single response.
        - Wait for the developer/OBSERVE output before moving to the next step.

        3. Step Sequence:
        - Follow the sequence of steps strictly:
            START → THINK → TOOL → OBSERVE → THINK → TOOL … → OUTPUT
        - Always perform **THINK** before deciding the next **TOOL** call.
        - After a **TOOL** call, wait for **OBSERVE** before any further steps.

        4. Tool Execution:
        - Every tool call must wait for the corresponding **OBSERVE** response.
        - For **TOOL** steps, include the exact "tool_name" and the serialized "input" JSON for the tool.
        - For **OBSERVE** steps, include the output returned from the tool.

        5. Thought Process:
        - Always think carefully and break the user query into subproblems.
        - Do not skip THINK steps. Every action must be preceded by logical reasoning in a THINK step.

        6. Validation:
        - Validate the JSON before responding. If you cannot produce valid JSON, respond with:
            {
            "step": "THINK",
            "content": "Cannot perform step due to invalid input or error",
            "tool_name": null,
            "input": null
            }

        7. Output:
        - The final step is **OUTPUT**. Include a clear summary of results in the "content".
        - Do not include any additional commentary outside the JSON.

        STRICTLY FOLLOW THESE RULES for every user query. Any deviation will break the flow.


    Output JSON Format:
    { "step": "START | THINK | OUTPUT | OBSERVE | TOOL" , "content": "string", "tool_name": "string", "input": "STRING" }

    Example:
    User: Clone the website https://example.com into ./saved-site and run it on port 5050
    ASSISTANT: { "step": "START", "content": "User asked to clone https://example.com into ./saved-site and serve it on port 5050" }
    ASSISTANT: { "step": "THINK", "content": "Decide whether the page needs JS rendering or a simple fetch. I'll render with Puppeteer to capture dynamic content." }
    ASSISTANT: { "step": "THINK", "content": "Plan steps: 1) render and save HTML, 2) extract assets (CSS/JS/images), 3) download assets, 4) rewrite HTML to local paths, 5) verify files, 6) start local server." }
    ASSISTANT: { "step": "TOOL", "tool_name": "clone_dynamic", "input": "{ \"url\": \"https://example.com\", \"outDir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "Rendered HTML saved at ./saved-site/raw.html" }

    ASSISTANT: { "step": "THINK", "content": "Now I need to load that raw HTML file before extracting links." }
    ASSISTANT: { "step": "TOOL", "tool_name": "read_file", "input": "{ \"path\": \"./saved-site/raw.html\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "<html> ...full raw HTML... </html>" }

    ASSISTANT: { "step": "TOOL", "tool_name": "extract_links", "input": "{ \"html\": \"<html> ...full raw HTML... </html>\", \"baseUrl\": \"https://example.com\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "{ \"scripts\": [\"https://example.com/js/app.js\"], \"stylesheets\": [\"https://example.com/css/style.css\"], \"images\": [\"https://example.com/images/logo.png\"], \"pages\": [\"https://example.com/about\"] }" }

    ASSISTANT: { "step": "THINK", "content": "Download all discovered assets (scripts, stylesheets, images) and save them under ./saved-site (js/, css/, images/)." }
    ASSISTANT: { "step": "TOOL", "tool_name": "download_asset", "input": "{ \"url\": \"https://example.com/js/app.js\", \"outDir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "Downloaded js/app.js" }

    ASSISTANT: { "step": "TOOL", "tool_name": "download_asset", "input": "{ \"url\": \"https://example.com/css/style.css\", \"outDir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "Downloaded css/style.css" }

    ASSISTANT: { "step": "TOOL", "tool_name": "download_asset", "input": "{ \"url\": \"https://example.com/images/logo.png\", \"outDir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "Downloaded images/logo.png" }

    ASSISTANT: { "step": "THINK", "content": "Now rewrite HTML references to local paths. First load raw.html again." }
    ASSISTANT: { "step": "TOOL", "tool_name": "read_file", "input": "{ \"path\": \"./saved-site/raw.html\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "<html> ...full raw HTML... </html>" }

    ASSISTANT: { "step": "TOOL", "tool_name": "rewrite_html", "input": "{ \"html\": \"<html> ...full raw HTML... </html>\", \"mapping\": { \"https://example.com/js/app.js\": \"js/app.js\", \"https://example.com/css/style.css\": \"css/style.css\", \"https://example.com/images/logo.png\": \"images/logo.png\" } }" }
    DEVELOPER: { "step": "OBSERVE", "content": "<html> ...rewritten HTML... </html>" }

    ASSISTANT: { "step": "TOOL", "tool_name": "save_html", "input": "{ \"html\": \"<html> ...rewritten HTML... </html>\", \"outDir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "index.html written to ./saved-site" }

    ASSISTANT: { "step": "TOOL", "tool_name": "list_files", "input": "{ \"dir\": \"./saved-site\" }" }
    DEVELOPER: { "step": "OBSERVE", "content": "index.html\ncss/style.css\njs/app.js\nimages/logo.png" }

    ASSISTANT: { "step": "TOOL", "tool_name": "start_server", "input": "{ \"outDir\": \"./saved-site\", \"port\": 5050 }" }
    DEVELOPER: { "step": "OBSERVE", "content": "Server running at http://localhost:5050" }

    ASSISTANT: { "step": "OUTPUT", "content": "The site was cloned and is available at http://localhost:5050. Files saved to ./saved-site (index.html, css/, js/, images/)." }

`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        "Clone https://www.piyushgarg.dev/ into ./saved-site and run locally into port 5050",
    },
  ];

  while (true) {
  console.log("\n📩 Sending messages to model:", messages);

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages,
  });

  let rawContent = response.choices[0].message.content;
  console.log("💬 Raw model output:", rawContent);

  if (!rawContent) {
    console.warn("⚠️ Model returned empty content. Retrying...");
    continue;
  }

  // 1️⃣ Strip code blocks and trim whitespace
  rawContent = rawContent.replace(/```json|```/gi, "").trim();
  console.log("✂️ Stripped raw content:", rawContent);

  // 2️⃣ Extract first valid JSON object if the model added extra text
  let parsedContent;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch (err) {
    console.warn("⚠️ Failed direct JSON parse, attempting regex extraction...");
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedContent = JSON.parse(match[0]);
      } catch (err2) {
        console.error("❌ Failed to parse extracted JSON:", match[0]);
        break;
      }
    } else {
      console.error("❌ No JSON found in model output:", rawContent);
      break;
    }
  }

  console.log("✅ Parsed JSON content:", parsedContent);

  // 3️⃣ Push the parsed content back to messages
  messages.push({
    role: "assistant",
    content: JSON.stringify(parsedContent),
  });
  console.log("📥 Pushed assistant step to messages");

  // 4️⃣ Handle each step type
  const step = parsedContent.step?.toUpperCase() || "UNKNOWN";
  console.log("🔹 Current step:", step);

  if (step === "START") {
    console.log("🔥 START content:", parsedContent.content);
    continue;
  }

  if (step === "THINK") {
    console.log("🧠 THINK content:", parsedContent.content);
    continue;
  }

  if (step === "TOOL") {
    console.log("🛠 TOOL step detected:", parsedContent.tool_name);

    const toolToCall = parsedContent.tool_name?.trim();
    const toolInput =
      typeof parsedContent.input === "string"
        ? JSON.parse(parsedContent.input)
        : parsedContent.input;

    console.log("🔧 Tool input:", toolInput);

    let responseFromTool;
    try {
      switch (toolToCall) {
        case "clone_dynamic":
          responseFromTool = await clone_dynamic(toolInput.url, toolInput.outDir);
          break;
        case "extract_links":
          responseFromTool = extract_links(toolInput.html, toolInput.baseUrl);
          break;
        case "download_asset":
          responseFromTool = await download_asset(toolInput.url, toolInput.outDir);
          break;
        case "rewrite_html":
          responseFromTool = rewrite_html(toolInput.html, toolInput.mapping);
          break;
        case "save_html":
          responseFromTool = save_html(toolInput.html, toolInput.outDir);
          break;
        case "start_server":
          responseFromTool = start_server(toolInput.outDir, toolInput.port);
          break;
        case "list_files":
          responseFromTool = await list_files(toolInput.dir);
          break;
        case "read_file":
          responseFromTool = read_file(toolInput.path);
          break;
        case "write_file":
          responseFromTool = await write_file(toolInput.path, toolInput.content);
          break;
        case "delete_file":
          responseFromTool = await delete_file(toolInput.path);
          break;
        case "copy_file":
          responseFromTool = await copy_file(toolInput.src, toolInput.dest);
          break;
        case "move_file":
          responseFromTool = await move_file(toolInput.src, toolInput.dest);
          break;
        case "zip_dir":
          responseFromTool = await zip_dir(toolInput.sourceDir, toolInput.outPath);
          break;
        case "run_shell":
          responseFromTool = await run_shell(toolInput.command);
          break;
        default:
          console.error(`❌ Unknown tool: ${toolToCall}`);
          continue;
      }
    } catch (toolErr) {
      console.error(`❌ Error executing tool ${toolToCall}:`, toolErr);
      responseFromTool = `Error executing tool: ${toolErr.message}`;
    }

    console.log(`🛠 TOOL result (${toolToCall}):`, responseFromTool);

    // Push OBSERVE back to messages
    messages.push({
      role: "developer",
      content: JSON.stringify({ step: "OBSERVE", content: responseFromTool }),
    });
    console.log("📥 Pushed OBSERVE result to messages");
    continue;
  }

  if (step === "OUTPUT") {
    console.log("🤖 OUTPUT content:", parsedContent.content);
    break;
  }

  console.warn("⚠️ Unrecognized step:", step, parsedContent);
}
}

main();



