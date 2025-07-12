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

  const smartJsonInstruction = `
You are an expert academic tutor. Analyze this question carefully and provide a thoughtful response.

Return a valid JSON object with "answer" and "explanation" fields:

- "answer": Provide the most direct, concise answer possible
- "explanation": Provide detailed reasoning, step-by-step work, context, and additional information

EXAMPLES:
- Multiple choice: "answer" = "B. Photosynthesis converts light energy into chemical energy", "explanation" = detailed reasoning
- Math problem: "answer" = "502.65 cm³", "explanation" = step-by-step calculation with formula
- Definition: "answer" = "Photosynthesis is the process by which plants convert light into chemical energy", "explanation" = detailed explanation with examples
- Explanatory: "answer" = "Mitosis occurs in four main phases to create two identical cells", "explanation" = detailed breakdown of each phase

QUALITY STANDARDS:
- For math problems, give the final numerical answer with units in "answer"
- Be academically rigorous and precise
- Use proper terminology for the subject
- Double-check calculations and facts
- Keep "answer" concise and direct

If the input contains multiple distinct questions:
- "answer": Provide all answers in order, separated by semicolons (e.g. "1945; Neil Armstrong")  
- "explanation": Address each question in separate, clearly spaced paragraphs. Put a blank line between each numbered explanation. Format exactly like this example:

1. First question explanation here.

2. Second question explanation here.

3. Third question explanation here.

Make sure there is a blank line between each numbered paragraph.

If the input contains only one question, respond normally.

Do not include markdown, code blocks, or text outside the JSON.
`;

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
              detail: "high", // Better image analysis
            },
          },
          {
            type: "text",
            text: `Analyze this image carefully and answer any questions shown. ${smartJsonInstruction}`,
          },
        ],
      },
    ];
  } else {
    // Add context for text questions
    const contextualPrompt = `Question: ${prompt}\n\n${smartJsonInstruction}`;
    messages = [
      {
        role: "user",
        content: contextualPrompt,
      },
    ];
  }

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.1, // Lower temperature for more consistent academic answers
    max_tokens: 1000, // Reasonable limit for explanations
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

      // Enhanced JSON parsing with better error handling
      try {
        const parsedResponse = JSON.parse(rawContent);

        // Validate response structure
        if (!parsedResponse.answer || !parsedResponse.explanation) {
          throw new Error("Invalid response structure");
        }

        if (abortController === controller) {
          abortController = null;
        }

        return {
          shortAnswer: parsedResponse.answer,
          explanation: parsedResponse.explanation,
        };
      } catch (parseError) {
        console.error("Failed to parse JSON from GPT response:", parseError);

        // Try to clean and re-parse
        const cleanedContent = rawContent
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .replace(/^[^{]*/, "") // Remove text before first {
          .replace(/[^}]*$/, "}") // Ensure ends with }
          .trim();

        try {
          const parsedFallback = JSON.parse(cleanedContent);
          return {
            shortAnswer: parsedFallback.answer || "Response parsing error",
            explanation: parsedFallback.explanation || rawContent,
          };
        } catch {
          // Try to extract answer from malformed JSON
          const answerMatch = rawContent.match(/"answer":\s*"([^"]+)"/);
          const explanationMatch = rawContent.match(
            /"explanation":\s*"([^"]+)"/
          );

          return {
            shortAnswer: answerMatch
              ? answerMatch[1]
              : "Could not parse response",
            explanation: explanationMatch
              ? explanationMatch[1]
              : "Please try asking the question again.",
          };
        }
      }
    } else {
      throw new Error("Unexpected response structure from API");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      if (abortController === controller) {
        abortController = null;
      }
      return null;
    } else {
      console.error("Error calling GPT API:", error);
      if (abortController === controller) {
        abortController = null;
      }
      return {
        shortAnswer: "Error: Unable to get a response",
        explanation:
          "An error occurred while processing your request. Please try again.",
      };
    }
  }
}
