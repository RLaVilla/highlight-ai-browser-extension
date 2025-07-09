/* global chrome */

import cheggIcon from "./assets/chegg.svg";
import quizletIcon from "./assets/quizlet.svg";
import googleIcon from "./assets/google.svg";
import SearchDropdown from "./SearchDropdown";
import React, { useRef, useEffect, useState } from "react";

import "./index.css";

const loadingPhrases = [
  "Getting your answer...",
  "Thinking really hard...",
  "Brewing your answer...",
  "Mixing the wisdom potion...",
  "Crafting your solution...",
  "Summoning the solution...",
  "Booting the brain bot...",
  "Cracking the code...",
  "Mining the data vault...",
  "Crunching the numbers...",
  "Making magic happen...",
];

function App() {
  const [selectedText, setSelectedText] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [image, setImage] = useState("");
  const [userQuestion, setUserQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [userMode, setUserMode] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState("AI");
  const [autoSearch, setAutoSearch] = useState(true);
  const [displayedText, setDisplayedText] = useState("");
  const [copiedItem, setCopiedItem] = useState(null);
  const [shouldRender, setShouldRender] = useState(userMode !== "image");
  const [isVisible, setIsVisible] = useState(userMode !== "image");

  const inputRef = useRef();

  const handleCopy = async (text, itemType) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemType);
      setTimeout(() => {
        setCopiedItem(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleLocationChange = (location) => {
    setSelectedLocation(location);
    chrome.storage.local.set({
      image: null,
      selectedText: "",
      aiResponse: "",
    });

    setSelectedText("");
    setAiResponse("");
    setImage(null);
    setIsLoading(false);

    if (location === "AI") {
      setDisplayedText(null);
    }
  };

  useEffect(() => {
    console.log("userMode changed to:", userMode);
    if (userMode !== "image") {
      console.log("Showing searchbar");
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      console.log("Hiding searchbar");
      setIsVisible(false); // This should trigger the exit animation
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [userMode]);

  useEffect(() => {
    if (isLoading) {
      const randomPhrase =
        loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
      setLoadingPhrase(randomPhrase);
    }
  }, [isLoading]);

  useEffect(() => {
    chrome.storage.local.get("userMode", ({ userMode }) => {
      if (userMode === "image") {
        // document.documentElement.classList.add("dark-mode");
        setUserMode("image");
      } else {
        // document.documentElement.classList.remove("dark-mode");
        setUserMode("highlight");
      }
    });
  }, []);

  useEffect(() => {
    if (autoSearch && selectedText) {
      setDisplayedText(selectedText);
    }
  }, [autoSearch, selectedText]);

  useEffect(() => {
    chrome.storage.local.set({ autoSearch });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === "local") {
        if (changes.selectedText) {
          setSelectedText(changes.selectedText.newValue || "");

          if (!autoSearch && changes.selectedText.newValue) {
            setUserQuestion(changes.selectedText.newValue);
            chrome.runtime.sendMessage({ action: "focusExtension" });

            requestAnimationFrame(() => {
              if (inputRef.current) {
                inputRef.current.style.height = "auto";
                inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
                inputRef.current.focus();
              }
            });
          }
        }

        if (changes.image) {
          setImage(changes.image.newValue || "");
        }

        if (changes.aiResponse) {
          setAiResponse(changes.aiResponse.newValue || "");
        }

        if (changes.isLoading) {
          setIsLoading(changes.isLoading.newValue);
        }

        if (changes.selectedLocation) {
          setSelectedLocation(changes.selectedLocation.newValue || "AI");
          setSelectedText("");
          setAiResponse("");
          setImage(null);
          setIsLoading(false);
        }
      }
    };

    chrome.storage.local.get(
      ["selectedText", "aiResponse", "selectedLocation"],
      (data) => {
        console.log("Data retrieved: ", data);

        if (data.selectedLocation !== selectedLocation) {
          setSelectedText("");
          setAiResponse("");
          setImage(null);
          setIsLoading(false);
        }

        setSelectedText(data.selectedText || "");
        setAiResponse(data.aiResponse || "");
        setSelectedLocation(data.selectedLocation || "AI");
        setIsLoading(data.isLoading || false);

        if (!autoSearch && data.selectedText) {
          setUserQuestion(data.selectedText);
          chrome.runtime.sendMessage({ action: "focusExtension" });

          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.style.height = "auto";
              inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
              inputRef.current.focus();
            }
          });
        }
      }
    );

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [selectedLocation, autoSearch]);

  const handleImageMode = () => {
    if (userMode === "image") return;
    // document.documentElement.classList.toggle("dark-mode");

    chrome.runtime.sendMessage({
      action: "abortGPTRequest",
      reason: "modeSwitch",
    });

    chrome.storage.local.set({
      aiResponse: "",
    });

    setUserMode("image");
    chrome.storage.local.set({ userMode: "image" });
    setSelectedLocation("AI");
    setAutoSearch(true);

    chrome.storage.local.set({
      image: null,
      selectedText: "",
    });

    setIsLoading(false);

    chrome.tabs.query({}, (tabs) => {
      console.log(tabs);
      tabs.forEach((tab) => {
        if (
          tab.url &&
          !tab.url.startsWith("chrome-extension://") &&
          !tab.url.startsWith("chrome://extensions")
        ) {
          chrome.tabs
            .sendMessage(tab.id, { action: "disableHighlighting" })
            .catch((err) => {
              console.warn(
                "Message failed to send to tab",
                tab.id,
                err.message
              );
            });
          chrome.tabs.sendMessage(tab.id, { action: "enableImageMode" });
        }
      });
    });
  };

  const handleHighlightMode = () => {
    if (userMode === "highlight") return;

    // document.documentElement.classList.remove("dark-mode");
    chrome.runtime.sendMessage({
      action: "abortGPTRequest",
      reason: "modeSwitch",
    });

    setUserMode("highlight");
    chrome.storage.local.set({ userMode: "highlight" });
    setDisplayedText("");

    chrome.storage.local.set({
      image: null,
      selectedText: "",
    });

    chrome.storage.local.set({
      aiResponse: "",
    });

    setIsLoading(false);

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && !tab.url.startsWith("chrome-extension://")) {
          chrome.tabs.sendMessage(tab.id, { action: "disableImageMode" });
          chrome.tabs
            .sendMessage(tab.id, { action: "enableHighlighting" })
            .catch((err) => {
              console.warn(
                "Message failed to send to tab",
                tab.id,
                err.message
              );
            });
        }
      });
    });
  };

  const handleAskQuestion = () => {
    const questionToSearch = userQuestion.trim() || selectedText.trim();

    if (questionToSearch) {
      chrome.storage.local.set(
        {
          selectedText: questionToSearch,
          userQuestion: "",
          isLoading: true,
        },
        () => {
          setDisplayedText(questionToSearch);
          setIsLoading(true);

          if (inputRef.current) {
            inputRef.current.value = "";
            inputRef.current.style.height = "auto";
          }

          setUserQuestion("");
          setSelectedText("");
          if (selectedLocation === "AI") {
            chrome.runtime.sendMessage(
              { action: "askGPT", text: questionToSearch },
              (response) => {
                console.log("Response from GPT-4:", response.answer);

                chrome.storage.local.set(
                  {
                    aiResponse: response.answer,
                    isLoading: false,
                  },
                  () => {
                    setAiResponse(response.answer);
                    setIsLoading(false);
                  }
                );
              }
            );
          } else if (selectedLocation === "Chegg") {
            handleSearch(
              "https://www.chegg.com/search?q=",
              "&contentType=study",
              questionToSearch
            );
          } else if (selectedLocation === "Quizlet") {
            handleSearch(
              "https://quizlet.com/search?query=",
              "&type=questions&useOriginal=",
              questionToSearch
            );
          } else if (selectedLocation === "Google") {
            handleSearch(
              "https://www.google.com/search?q=",
              undefined,
              questionToSearch
            );
          }
        }
      );
    }
  };

  const handleInputChange = (event) => {
    setUserQuestion(event.target.value);

    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleAskQuestion();
    }
  };

  const handlePromptClick = () => {
    setUserQuestion(displayedText);
    setTimeout(() => {
      const textarea = inputRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      inputRef.current.focus();
    }, 0);
  };

  const handleSearch = async (baseUrl, suffix = "", prompt = selectedText) => {
    if (!prompt) return;

    const query = encodeURIComponent(prompt);
    const fullUrl = `${baseUrl}${query}${suffix}`;
    chrome.runtime.sendMessage({ action: "searchInTab", url: fullUrl });
  };

  const handleAutoButtonClick = () => {
    setAutoSearch((prev) => !prev);
    setSelectedText("");
    setUserQuestion("");

    chrome.storage.local.set({
      autoSearch: autoSearch,
      userQuestion: "",
      selectedText: "",
    });

    inputRef.current.value = "";
    inputRef.current.style.height = "auto";
    console.log("inputRef", inputRef.current);
  };

  return (
    <div className="appContainer">
      <div className="buttonContainer">
        <div className="toggleModeButtonContainer">
          <button
            onClick={handleImageMode}
            title="Toggle Image Mode"
            className={`imageButton ${userMode === "image" ? "active" : ""}`}
          >
            <svg
              className="dragImg"
              viewBox="1.33 1.33 21.34 21.34"
              fill="currentColor"
            >
              <path d="M22.67,12L18.18,16.5L15.67,14L17.65,12L15.67,10.04L18.18,7.53L22.67,12M12,1.33L16.47,5.82L13.96,8.33L12,6.35L10,8.33L7.5,5.82L12,1.33M12,22.67L7.53,18.18L10.04,15.67L12,17.65L14,15.67L16.5,18.18L12,22.67M1.33,12L5.82,7.5L8.33,10L6.35,12L8.33,13.96L5.82,16.47L1.33,12M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10Z" />
            </svg>
          </button>
          <button
            onClick={handleHighlightMode}
            title="Toggle Highlight Mode"
            className={`highlightButton ${userMode === "highlight" ? "active" : ""}`}
          >
            <svg
              className="highlighterImg"
              viewBox="4 2.47 16.59 14.52"
              fill="currentColor"
            >
              <path d="M4,17L6.75,14.25L6.72,14.23C6.14,13.64 6.14,12.69 6.72,12.11L11.46,7.37L15.7,11.61L10.96,16.35C10.39,16.93 9.46,16.93 8.87,16.37L8.24,17H4M15.91,2.91C16.5,2.33 17.45,2.33 18.03,2.91L20.16,5.03C20.74,5.62 20.74,6.57 20.16,7.16L16.86,10.45L12.62,6.21L15.91,2.91Z" />
            </svg>
          </button>
        </div>
        <div className="rightHeaderContainer">
          <SearchDropdown
            disabled={userMode === "image"}
            selectedLocation={selectedLocation}
            onLocationChange={handleLocationChange}
            setAutoSearch={setAutoSearch}
          />
          <button
            disabled={userMode === "image" || selectedLocation !== "AI"}
            className={`autoButton ${autoSearch ? "active" : ""}`}
            onClick={handleAutoButtonClick}
            title="Toggle Auto Search"
          >
            <svg
              className={`autoImg ${autoSearch ? "active-auto" : ""}`}
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
          </button>
        </div>
      </div>
      {shouldRender && (
        <div className={`searchBarDiv ${isVisible ? "visible" : "hidden"}`}>
          <textarea
            type="text"
            name="prompt"
            id="prompt"
            ref={inputRef}
            value={userQuestion}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
          />
          <button className="searchButton" onClick={handleAskQuestion}>
            <svg
              className="searchIcon"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </div>
      )}
      {userMode === "image" && image ? (
        <>
          <h2 className="question">QUESTION</h2>
          <div
            className={`imgContainer ${isLoading ? "imgLoading" : ""}`}
            key={image}
          >
            <img src={image} alt="Captured" />
          </div>
        </>
      ) : userMode === "highlight" &&
        selectedLocation === "AI" &&
        displayedText ? (
        <>
          <h1 className="question">QUESTION</h1>
          <div className="promptArea">
            <h2
              onClick={handlePromptClick}
              title="Click to paste text into search bar"
              key={displayedText}
            >
              {displayedText}
            </h2>
          </div>
        </>
      ) : null}

      {(aiResponse || isLoading) && selectedLocation === "AI" ? (
        <>
          {!isLoading ? <h2 className="label">ANSWER</h2> : null}
          <div
            className="answerArea"
            key={isLoading}
            style={{ margin: isLoading ? "8px 8px" : "0px 8px" }}
          >
            {isLoading ? (
              <div className="loading" data-text={loadingPhrase}></div>
            ) : (
              <>
                <div class="explanationContainerDiv">
                  <p
                    className={`explanation ${copiedItem === "explanation" ? "copied" : ""}`}
                    onClick={() =>
                      handleCopy(aiResponse.explanation, "explanation")
                    }
                    title={
                      copiedItem === "explanation"
                        ? "Copied!"
                        : "Click to copy explanation"
                    }
                    style={{ cursor: "copy" }}
                  >
                    {aiResponse.explanation}
                  </p>
                  {copiedItem === "explanation" && (
                    <div className="copy-feedback">✓ Explanation copied!</div>
                  )}
                </div>
                <div class="solutionDiv">
                  <h1 className="solution">SOLUTION</h1>
                  <div class="answerContainer">
                    <p
                      className={`answer ${copiedItem === "answer" ? "copied" : ""}`}
                      onClick={() =>
                        handleCopy(aiResponse.shortAnswer, "answer")
                      }
                      title={
                        copiedItem === "answer"
                          ? "Copied!"
                          : "Click to copy answer"
                      }
                      style={{ cursor: "copy" }}
                    >
                      {aiResponse.shortAnswer}
                    </p>
                    {copiedItem === "answer" && (
                      <div className="copy-feedback">✓ Answer copied!</div>
                    )}
                  </div>
                </div>
              </>
            )}
            {userMode === "highlight" && aiResponse && !isLoading ? (
              <div className="linkButtonContainer">
                <button
                  className="linkButton"
                  onClick={() =>
                    handleSearch(
                      "https://quizlet.com/search?query=",
                      "&type=questions&useOriginal="
                    )
                  }
                >
                  <img src={quizletIcon} alt="Search on Quizlet" />
                </button>
                <button
                  className="linkButton"
                  onClick={() =>
                    handleSearch(
                      "https://www.chegg.com/search?q=",
                      "&contentType=study"
                    )
                  }
                >
                  <img src={cheggIcon} alt="Search on Chegg" />
                </button>
                <button
                  className="linkButton"
                  onClick={() =>
                    handleSearch("https://www.google.com/search?q=")
                  }
                >
                  <img src={googleIcon} alt="Search on Google" />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default App;
