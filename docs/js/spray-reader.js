var SprayReader = function(containerSelector){ 
  this.container = $('#spray_container');
  this.sprayResultElement = $(containerSelector);
  this.wordCounterElement = $('#word_counter');
  this.highlighter = $('#input-text-highlighter');
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
  totalWordCount: 0,
  isRunning: false,
  timers: [],

  setInput: function(input) {
    this.input = input;
    this.highlighter.html('');

    var re = /\S+/g;
    var match;
    var allWords = [];
    while(match = re.exec(input)) {
        allWords.push({
            word: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }

    // Preprocess words
    var tmpWords = [];

    for (var i=0; i<allWords.length; i++){
      var wordObj = allWords[i];
      var word = wordObj.word;

      var processedWordObj = {
          word: word,
          start: wordObj.start,
          end: wordObj.end
      };

      if(word.indexOf('.') != -1){
        processedWordObj.word = word.replace('.', '•');
      }
      tmpWords.push(processedWordObj);

      // Double up on long words and words with commas.
      if((word.indexOf(',') != -1 || word.indexOf(':') != -1 || word.indexOf('-') != -1 || word.indexOf('(') != -1|| word.length > 8) && word.indexOf('.') == -1){
        tmpWords.push(processedWordObj);
        tmpWords.push(processedWordObj);
      }

      // Add an additional space after punctuation.
      if(word.indexOf('.') != -1 || word.indexOf('!') != -1 || word.indexOf('?') != -1 || word.indexOf(':') != -1 || word.indexOf(';') != -1|| word.indexOf(')') != -1){
        var pauseObj = { word: '.', start: -1, end: -1 };
        tmpWords.push(pauseObj);
        tmpWords.push(pauseObj);
        tmpWords.push(pauseObj);
      }
    }

    this.words = tmpWords;
    this.totalWordCount = this.words.length;
    this.wordIdx = 0;
    this.wordCounterElement.text("0 / " + this.totalWordCount);
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
    if (this.wordCounterElement) {
        this.wordCounterElement.text("0 / " + this.totalWordCount);
    }
    this.highlighter.html('');
  },

  displayWordAndIncrement: function() {
    if (!this.isRunning || !this.words || this.wordIdx >= this.words.length) {
      this.stop();
      return;
    }

    this.wordCounterElement.text((this.wordIdx + 1) + " / " + this.totalWordCount);

    // Clear any existing timers before displaying the next word
    // This is important if displayWordAndIncrement is called ahead of schedule (e.g. by a premature fallback)
    for(var i = 0; i < this.timers.length; i++) {
      clearTimeout(this.timers[i]);
    }
    this.timers = [];

    var currentWordObj = this.words[this.wordIdx];
    this.highlightWord(currentWordObj);
    var currentWord = currentWordObj.word;
    var pivotedWord = pivot(currentWord);
    this.sprayResultElement.html(pivotedWord); // Display word in #spray_result

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
              scheduleNextWord(this.msPerWord); // Schedule next word with standard delay
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
    if (this.fontSize < 10) { // Prevent font size from becoming too large
      this.fontSize += 0.5; 
      this.container.css('font-size', `clamp(16px, ${this.fontSize}vw, 72px)`);
    }
  },

  decreaseFontSize: function() {
    if (this.fontSize > 1) { 
      this.fontSize -= 0.5; 
      this.container.css('font-size', `clamp(16px, ${this.fontSize}vw, 72px)`);
    }
  },

  highlightWord: function(wordObj) {
    if (wordObj.start === -1) {
      this.highlighter.html('');
      return;
    }

    var text = this.input;
    var before = text.substring(0, wordObj.start);
    var word = text.substring(wordObj.start, wordObj.end);
    var after = text.substring(wordObj.end);

    var html = before + '<span class="highlight">' + word + '</span>' + after;
    this.highlighter.html(html);
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
