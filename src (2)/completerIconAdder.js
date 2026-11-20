
let l = editorManager.editor ;
// 'l' is the main editor instance
l.on("change", function onEditorChange() {
  var completer;
  
  // Check if the completer and its popup are active
  if (
    (completer = l.completer) !== null &&
    completer !== undefined &&
    completer.popup
  ) {
    
    // This is the self-executing function that does all the work
    (function() {
      const doNothing = function() {};
      const popup = l.completer.popup;
      const textLayerElement = popup.renderer.$textLayer.element;
      const tokenizer = popup.session.bgTokenizer;

      // --- THIS IS THE MOST IMPORTANT PART ---
      // It completely overrides the default function that styles each
      // row in the autocomplete list.
      tokenizer.$tokenizeRow = function(rowIndex) {
        let item = popup.data[rowIndex]; // Get the completion item
        const tokens = [];
        
        if (!item) return tokens;
        if (typeof item === "string") {
          item = { value: item };
        }

        const caption = item.caption || item.value || item.name;

        // 1. ADD ICON
        if (item.icon) {
          // If a custom icon is specified
          tokens.push({
            type: "completion-icon " + item.icon.replaceAll(".", " "),
            value: ""
          });
        } else {
          // Otherwise, use the 'meta' property to create an icon class
          let metaType = item.meta.toLowerCase().replaceAll(/[_\s\/]/g, "-");
          
          if (metaType !== "local" && metaType !== "file") {
            // Special handling for color previews in the list
            if (metaType === "color") {
              metaType = "color " + item.value.toLowerCase();
            } else if (metaType === "tw-color") { // Tailwind color
              metaType = "color " + item.message.slice(item.message.indexOf(":") + 1, -1);
            }
            tokens.push({ type: "completion-icon." + metaType, value: "" });
          }
        }

        // Helper function to add a text token
        function addToken(value, className) {
          if (value) {
            tokens.push({
              type: (item.className || "") + (className || ""),
              value: value
            });
          }
        }

        // 2. ADD HIGHLIGHTED MATCH
        const filterText = (popup.filterText || "").toLowerCase();
        const captionLower = caption.toLowerCase();
        let filterStart = 0;
        let filterOffset = 0;
        
        // This loop finds the parts of the caption that match
        // the user's typed text and wraps them in a highlight class.
        for (let i = 0; i <= filterText.length; i++) {
          if (i != filterOffset && (popup.matchMask & (1 << i) || i == filterText.length)) {
            const subFilter = filterText.slice(filterOffset, i);
            filterOffset = i;
            const matchIndex = captionLower.indexOf(subFilter, filterStart);
            
            if (matchIndex == -1) continue;
            
            // Add non-matching part
            addToken(caption.slice(filterStart, matchIndex), "");
            filterStart = matchIndex + subFilter.length;
            // Add matching part
            addToken(caption.slice(matchIndex, filterStart), "completion-highlight");
          }
        }
        // Add the rest of the text
        addToken(caption.slice(filterStart, caption.length), "");

        // 3. ADD META (e.g., "property", "snippet")
        if (item.meta) {
          tokens.push({ type: "completion-meta", value: item.meta });
        }
        
        // 4. ADD MESSAGE (the text for the info box)
        if (item.message) {
          tokens.push({ type: "completion-message", value: item.message });
        }

        return tokens;
      };

      // Set empty functions for tokenizer updates
      tokenizer.$updateOnChange = doNothing;
      tokenizer.start = doNothing;

      // 5. RENDER COLOR PREVIEWS
      // After the popup renders, find any "color" icons
      // and manually set their background color.
      popup.renderer.on("afterRender", () => {
        const colorElements = textLayerElement.querySelectorAll(".ace_color");
        if (colorElements) {
          colorElements.forEach((el) => {
            // The color value was stored in the class name
            el.style.background = el.className.substring(29).trim();
          });
        }
      });
    })();

    // Remove this listener so it doesn't run again
    l.off("change", onEditorChange);
  }
});