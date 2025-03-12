/* global chrome */

import React, { useEffect, useState } from "react";
import "./index.css";

function App() {
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    chrome.storage.local.get("selectedText", (data) => {
      console.log("Data retrieved: ", data);
      setSelectedText(data.selectedText || "");
    });
  }, []);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.selectedText) {
      setSelectedText(changes.selectedText.newValue || "");
    }
  });

  return (
    <>
      <div className="headerContainer">
        <h1>AI Highlight To Search</h1>
      </div>
      <div className="searchBarDiv">
        <input type="text" name="prompt" id="prompt" />
        <button></button>
      </div>
      <div className="answerArea">
        <p>{selectedText ? selectedText : "Highlight something!"}</p>
      </div>
    </>
  );
}

export default App;
