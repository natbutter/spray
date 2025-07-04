var SprayReader = function(container){
  this.container = $(container);
  // Initial font size is 3vw as defined in spray-style.css
  this.fontSize = 3;
  this.guideElements = $('#guide_top, #guide_bottom, #notch');
  this.speechSynthesis = window.speechSynthesis;
  this.isAudioEnabled = false;
};
SprayReader.prototype = {
  wpm: null,
  msPerWord: null,
  wordIdx: null,
  input: null,
  words: null,
  isRunning: false,
  timers: [],

  setInput: function(input) {
    this.input = input;

    // Split on spaces
    var allWords = input.split(/\s+/);

    var word = '';
    var result = '';

    // Preprocess words
    var tmpWords = allWords.slice(0); // copy Array
    var t = 0;

    for (var i=0; i<allWords.length; i++){

      if(allWords[i].indexOf('.') != -1){
        tmpWords[t] = allWords[i].replace('.', '•');
      }

      // Double up on long words and words with commas.
      if((allWords[i].indexOf(',') != -1 || allWords[i].indexOf(':') != -1 || allWords[i].indexOf('-') != -1 || allWords[i].indexOf('(') != -1|| allWords[i].length > 8) && allWords[i].indexOf('.') == -1){
        tmpWords.splice(t+1, 0, allWords[i]);
        tmpWords.splice(t+1, 0, allWords[i]);
        t++;
        t++;
      }

      // Add an additional space after punctuation.
      if(allWords[i].indexOf('.') != -1 || allWords[i].indexOf('!') != -1 || allWords[i].indexOf('?') != -1 || allWords[i].indexOf(':') != -1 || allWords[i].indexOf(';') != -1|| allWords[i].indexOf(')') != -1){
        tmpWords.splice(t+1, 0, ".");
        tmpWords.splice(t+1, 0, ".");
        tmpWords.splice(t+1, 0, ".");
        t++;
        t++;
        t++;
      }

      t++;
    }

    this.words = tmpWords.slice(0);
    this.wordIdx = 0;
  },

  setWpm: function(wpm) {
    this.wpm = parseInt(wpm, 10);
    this.msPerWord = 60000/wpm;
  },

  start: function() {
    this.isRunning = true;

    // If there are any uncleared timers, clear them.
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = []; // Reset timers array

    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel(); // Stop any ongoing speech
    }

    // Ensure word index starts from the beginning if input is re-started.
    // this.wordIdx = 0; // This might be better placed in setInput or a dedicated reset method

    if (this.words && this.words.length > 0) {
      this.displayWordAndIncrement(); // Start the display process
    }
  },

  stop: function() {
    this.isRunning = false;

    // Clear all main timers
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = []; // Reset the timers array

    // Clear the fallback timer if it's active
    if (this.fallbackTimerId) {
      clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = null;
    }

    // Stop any ongoing speech
    if (this.speechSynthesis && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
    // No need to reset wordIdx here, as starting again should handle it or setInput.
  },

  displayWordAndIncrement: function() {
    if (!this.isRunning || !this.words || this.wordIdx >= this.words.length) {
      this.stop();
      return;
    }

    // Clear any existing timers before displaying the next word
    // This is important if displayWordAndIncrement is called ahead of schedule (e.g. by a premature fallback)
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = [];

    var currentWord = this.words[this.wordIdx];
    var pivotedWord = pivot(currentWord);
    this.container.html(pivotedWord);

    var thisObj = this; // Store 'this' for use in callbacks

    var scheduleNextWord = function(delay) {
      if (thisObj.isRunning) {
        var timerId = setTimeout(function() {
          thisObj.displayWordAndIncrement();
        }, delay);
        thisObj.timers.push(timerId);
      }
    };

    if (this.isAudioEnabled && this.speechSynthesis) {
      var wordToSpeak = currentWord.replace(/[•:,.;?!()-]/g, '').trim();

      if (wordToSpeak.length > 0) {
        var utterance = new SpeechSynthesisUtterance(wordToSpeak);
        var calculatedRate = this.wpm / 100; // Adjusted from 150 to 100 for potentially more natural variance
        utterance.rate = Math.max(0.5, Math.min(calculatedRate, 4)); // Max rate clamped to 4 (higher can be too fast)

        // Clear previous fallback timer if any
        if (this.fallbackTimerId) {
          clearTimeout(this.fallbackTimerId);
          this.fallbackTimerId = null;
        }

        utterance.onend = function() {
          if (thisObj.fallbackTimerId) { // Clear the fallback timer as speech completed
            clearTimeout(thisObj.fallbackTimerId);
            thisObj.fallbackTimerId = null;
          }
          if (thisObj.isRunning) {
            thisObj.wordIdx++;
            if (thisObj.wordIdx >= thisObj.words.length) {
              thisObj.stop();
            } else {
              scheduleNextWord(thisObj.msPerWord);
            }
          }
        };

        utterance.onerror = function(event) {
          console.error("Speech synthesis error:", event.error);
          if (thisObj.fallbackTimerId) { // Clear the fallback timer
            clearTimeout(thisObj.fallbackTimerId);
            thisObj.fallbackTimerId = null;
          }
          // Proceed to next word even if there's a speech error
          if (thisObj.isRunning) {
            thisObj.wordIdx++;
            if (thisObj.wordIdx >= thisObj.words.length) {
              thisObj.stop();
            } else {
              scheduleNextWord(thisObj.msPerWord); // Schedule next word with standard delay
            }
          }
        };

        this.speechSynthesis.speak(utterance);

        // Fallback timer: estimate max speech duration + small buffer, or use msPerWord as a simple fallback
        // Using msPerWord * 2 as a simple heuristic for fallback. This might need tuning.
        // This fallback is to ensure the reader progresses if onend never fires.
        var fallbackDelay = Math.max(this.msPerWord, 1000) * 2; // Ensure a minimum sensible delay
        this.fallbackTimerId = setTimeout(function() {
          thisObj.fallbackTimerId = null; // Clear the ID once the timer fires
          if (thisObj.speechSynthesis.speaking) { // If it's still speaking, cancel it to avoid overlap
             thisObj.speechSynthesis.cancel();
          }
          // This function will be called if utterance.onend doesn't fire in time.
          // It effectively simulates onend.
          if (thisObj.isRunning) {
            thisObj.wordIdx++;
            if (thisObj.wordIdx >= thisObj.words.length) {
              thisObj.stop();
            } else {
              scheduleNextWord(thisObj.msPerWord);
            }
          }
        }, fallbackDelay);

      } else { // Word to speak is empty after cleaning
        this.wordIdx++;
        if (this.wordIdx >= this.words.length) {
          this.stop();
        } else {
          scheduleNextWord(this.msPerWord); // Schedule next word immediately
        }
      }
    } else { // Audio not enabled
      this.wordIdx++;
      if (this.wordIdx >= this.words.length) {
        this.stop();
      } else {
        scheduleNextWord(this.msPerWord);
      }
    }
  },

  increaseFontSize: function() {
    if (this.fontSize < 4) {
      this.fontSize += 0.5; // Increment vw unit
      this.container.css('font-size', this.fontSize + 'vw');
      // guideElements will inherit font-size from container
    }
  },

  decreaseFontSize: function() {
    if (this.fontSize > 1) { // Prevent font size from becoming too small (1vw is a reasonable lower limit)
      this.fontSize -= 0.5; // Decrement vw unit
      this.container.css('font-size', this.fontSize + 'vw');
      // guideElements will inherit font-size from container
    }
  }
};

// Find the red-character of the current word.
function pivot(word){ // Removed fontSize parameter
    var length = word.length;

    // Longer words are "right-weighted" for easier readability.
    if(length<6){

        var bit = 1;
        while(word.length < 22){
            if(bit > 0){
                word = word + '.';
            }
            else{
                word = '.' + word;
            }
            bit = bit * -1;
        }

        var start = '';
        var end = '';
        if((length % 2) === 0){
            start = word.slice(0, word.length/2);
            end = word.slice(word.length/2, word.length);
        } else{
            start = word.slice(0, word.length/2);
            end = word.slice(word.length/2, word.length);
        }

        var result;
        // Removed inline style for font-size, they will inherit from parent
        result = "<span class='spray_start'>" + start.slice(0, start.length -1);
        result = result + "</span><span class='spray_pivot'>";
        result = result + start.slice(start.length-1, start.length);
        result = result + "</span><span class='spray_end'>";
        result = result + end;
        result = result + "</span>";
    }

    else{

        var tail = 22 - (word.length + 7);
        word = '.......' + word + ('.'.repeat(tail));

        var start = word.slice(0, word.length/2);
        var end = word.slice(word.length/2, word.length);

        var result;
        // Removed inline style for font-size, they will inherit from parent
        result = "<span class='spray_start'>" + start.slice(0, start.length -1);
        result = result + "</span><span class='spray_pivot'>";
        result = result + start.slice(start.length-1, start.length);
        result = result + "</span><span class='spray_end'>";
        result = result + end;
        result = result + "</span>";

    }

    result = result.replace(/\./g, "<span class='invisible'>.</span>"); // Also for invisible utility class

    return result;
}

// Let strings repeat themselves,
// because JavaScript isn't as awesome as Python.
String.prototype.repeat = function( num ){
    return (num<=0) ? "" : new Array( num + 1 ).join( this );
}
