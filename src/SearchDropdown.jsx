/* global chrome */

import React, { useState, useEffect, useRef } from "react";

import cheggIcon from "./assets/chegg.svg";
import quizletIcon from "./assets/quizlet.svg";
import googleIcon from "./assets/google.svg";
import aiIcon from "./assets/ai.svg";

const SearchDropdown = ({ onLocationChange, disabled, setAutoSearch }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const searchLocations = [
    { name: "AI", icon: aiIcon },
    { name: "Google", icon: googleIcon },
    { name: "Quizlet", icon: quizletIcon },
    { name: "Chegg", icon: cheggIcon },
  ];

  useEffect(() => {
    chrome.storage.local.get(["selectedLocation"], (result) => {
      const location = result.selectedLocation || "AI";
      setSelectedLocation(location);
    });
  }, []);

  useEffect(() => {
    if (disabled) {
      setSelectedLocation("AI");
      chrome.storage.local.set({ selectedLocation: "AI" });
    }
  }, [disabled]);

  const handleButtonClick = () => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  };

  const handleLocationChange = (locationName) => {
    setSelectedLocation(locationName);
    onLocationChange(locationName);
    chrome.storage.local.set({ selectedLocation: locationName });

    if (locationName !== "AI") {
      setAutoSearch(true);
    }

    setIsOpen(false);
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div
      className={`dropdownContainer ${isOpen ? "open" : ""}`}
      ref={dropdownRef}
    >
      <button
        title="Change Search Destination"
        className={`dropdownButton ${isOpen ? "noTransform" : ""}`}
        onClick={handleButtonClick}
        disabled={disabled}
        style={{
          width: "40px",
          height: "40px",
          padding: isOpen ? "7px" : "5px",
          borderRadius: isOpen ? "5px 5px 0 0" : "5px",
          opacity: 1,
          transform: isOpen ? "scale(1)" : "scale(0.8)",
          transition: "all 0.2s ease",
          boxShadow: isOpen && "0 0 12px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div
          className="buttonBackground"
          style={{
            borderBottomRightRadius: isOpen ? "0" : "5px",
            borderBottomLeftRadius: isOpen ? "0" : "5px",
            borderTopRightRadius: "5px",
            borderTopLeftRadius: "5px",
          }}
        ></div>
        <img
          src={
            searchLocations.find((loc) => loc.name === selectedLocation)?.icon
          }
          alt={selectedLocation}
        />
      </button>

      {!disabled && (
        <div
          className="dropdownMenu"
          style={{
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? "auto" : "none",
            display: "block",
            visibility: isOpen ? "visible" : "hidden",
            transition: "all 0.2s ease-in-out",
          }}
        >
          {searchLocations
            .filter((location) => location.name !== selectedLocation)
            .map((location) => (
              <button
                key={location.name}
                className="dropdownItem"
                onClick={() => handleLocationChange(location.name)}
              >
                <img src={location.icon} alt={location.name} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default SearchDropdown;
