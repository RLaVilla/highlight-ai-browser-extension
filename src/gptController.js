import { config } from "./config.js";

let abortController = null;

export function abortCurrentRequest() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  } else {
    console.log("No abortController found - nothing to abort");
  }
}

export async function askGPT(prompt) {
  abortCurrentRequest();

  const controller = new AbortController();

  abortController = controller;

  const signal = controller.signal;

  const apiKey = config.openaiApiKey;
  const model = "gpt-4o-mini";
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const jsonInstruction = `
    Return a valid JSON object with only two fields: "answer" and "explanation". Do not include markdown, code blocks (like triple backticks), or any extra text outside the JSON.
    - If the input is a multiple choice question, "answer" should contain the capital letter and correct answer (e.g. "B. Photosynthesis"), and "explanation" should provide a detailed explanation.
- If the input is an open-ended question (no answer choices), then "answer" should contain a concise answer, and "explanation" should elaborate.
- If the input is not a question, set "answer" to "Try asking a question!" and provide a friendly explanation.
  `;
  const fullPrompt =
    typeof prompt === "string" && !prompt.startsWith("data:image")
      ? `${prompt}\n\n${jsonInstruction}`
      : prompt;

  let messages;

  if (typeof prompt === "string" && prompt.startsWith("data:image")) {
    messages = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: prompt,
            },
          },
          {
            type: "text",
            text: "Please answer the question and " + jsonInstruction,
          },
        ],
      },
    ];
  } else {
    messages = [
      {
        role: "user",
        content: fullPrompt,
      },
    ];
  }

  const body = JSON.stringify({
    model,
    messages,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      const rawContent = data.choices[0].message.content.trim();
      try {
        const parsedResponse = JSON.parse(rawContent);
        if (abortController === controller) {
          abortController = null;
        }
        return {
          shortAnswer: parsedResponse.answer,
          explanation: parsedResponse.explanation,
        };
      } catch (parseError) {
        console.error("Failed to parse JSON from GPT response:", parseError);
        const cleanedContent = rawContent
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();
        try {
          const parsedFallback = JSON.parse(cleanedContent);
          return {
            shortAnswer: parsedFallback.answer,
            explanation: parsedFallback.explanation,
          };
        } catch (secondParseError) {
          console.error("Fallback parsing failed:", secondParseError);
          return {
            shortAnswer: rawContent,
            explanation:
              "No detailed explanation available due to parsing error",
          };
        }
      }
    } else {
      throw new Error("Unexpected response structure from GPT-4");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      if (abortController === controller) {
        abortController = null;
      }
      return null;
    } else {
      console.error("Error calling GPT-4 API:", error);
      if (abortController === controller) {
        abortController = null;
      }
      return {
        shortAnswer: "Error: Unable to get a response",
        explanation: "An error occurred while processing your request",
      };
    }
  }
}
